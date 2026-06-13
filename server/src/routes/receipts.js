import express from 'express';
import { nanoid } from 'nanoid';
import { DEFAULT_USER, readReceipts, writeReceipts } from '../storage.js';

const router = express.Router();

const CHANNELS = new Set(['wechat', 'alipay', 'cash']);
const ANALYTICS_GRANULARITIES = new Set(['year', 'month', 'day']);
const ENTRY_GRANULARITIES = new Set(['month', 'day']);
const PERIOD_PATTERNS = {
  year: /^\d{4}$/,
  month: /^\d{4}-(0[1-9]|1[0-2])$/,
  day: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
};

const ok = (res, data = null, message = 'success') => res.json({ code: 0, message, data });
const fail = (res, status, message) => res.status(status).json({ code: status, message, data: null });

function normalizeUserId(value) {
  const text = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{2,32}$/.test(text) ? text : DEFAULT_USER.id;
}

function getCurrentUserId(req) {
  return normalizeUserId(req.get('x-user-id') || req.query.userId || DEFAULT_USER.id);
}

function normalizeChannel(value) {
  return CHANNELS.has(value) ? value : null;
}

function normalizeGranularity(value, allowed = ANALYTICS_GRANULARITIES) {
  return allowed.has(value) ? value : null;
}

function normalizePeriod(granularity, value) {
  if (!granularity || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!PERIOD_PATTERNS[granularity].test(trimmed)) return null;

  if (granularity === 'day') {
    const date = new Date(`${trimmed}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    if (date.toISOString().slice(0, 10) !== trimmed) return null;
  }

  return trimmed;
}

function buildDate(granularity, period) {
  if (granularity === 'month') return `${period}-01`;
  return period;
}

function getParentPeriod(granularity, period) {
  if (granularity === 'month') return period.slice(0, 4);
  if (granularity === 'day') return period.slice(0, 7);
  return '';
}

function normalizeReceipt(item) {
  const channel = normalizeChannel(item.channel);
  const granularity = normalizeGranularity(item.granularity);
  const period = normalizePeriod(granularity, item.period);

  if (!channel || !granularity || !period) return null;

  return {
    id: item.id,
    userId: normalizeUserId(item.userId),
    channel,
    granularity,
    period,
    date: item.date || buildDate(granularity, period),
    amount: Math.round(Number(item.amount || 0) * 100) / 100,
    people: Number(item.people || 0),
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
  };
}

async function getSourceReceipts() {
  const receipts = await readReceipts();
  return receipts
    .map(normalizeReceipt)
    .filter(Boolean)
    .filter((item) => item.granularity === 'month' || item.granularity === 'day');
}

async function getUserReceipts(userId) {
  const receipts = await getSourceReceipts();
  return receipts.filter((item) => item.userId === userId);
}

function mergeUserReceipts(allReceipts, userId, userReceipts) {
  return [
    ...allReceipts.filter((item) => item.userId !== userId),
    ...userReceipts.map((item) => ({ ...item, userId }))
  ];
}

function monthKey(channel, period) {
  return `${channel}__${period}`;
}

function summarizeReceipts(receipts) {
  const summary = {
    wechat: { amount: 0, people: 0 },
    alipay: { amount: 0, people: 0 },
    cash: { amount: 0, people: 0 },
    total: { amount: 0, people: 0 }
  };

  for (const item of receipts) {
    summary[item.channel].amount += Number(item.amount);
    summary[item.channel].people += Number(item.people);
    summary.total.amount += Number(item.amount);
    summary.total.people += Number(item.people);
  }

  for (const key of Object.keys(summary)) {
    summary[key].amount = Math.round(summary[key].amount * 100) / 100;
  }

  return summary;
}

function buildEffectiveMonthRecords(receipts) {
  const manualMonths = receipts.filter((item) => item.granularity === 'month');
  const days = receipts.filter((item) => item.granularity === 'day');

  const manualMap = new Map();
  for (const item of manualMonths) {
    manualMap.set(monthKey(item.channel, item.period), item);
  }

  const dayMap = new Map();
  for (const item of days) {
    const monthPeriod = item.period.slice(0, 7);
    const key = monthKey(item.channel, monthPeriod);
    const current = dayMap.get(key) || {
      id: `derived-${item.channel}-${monthPeriod}`,
      channel: item.channel,
      granularity: 'month',
      period: monthPeriod,
      date: `${monthPeriod}-01`,
      amount: 0,
      people: 0,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      derivedFrom: 'day',
      isOverridden: false
    };

    current.amount += Number(item.amount);
    current.people += Number(item.people);
    if (item.createdAt < current.createdAt) current.createdAt = item.createdAt;
    if (item.updatedAt > current.updatedAt) current.updatedAt = item.updatedAt;
    dayMap.set(key, current);
  }

  const keys = new Set([...manualMap.keys(), ...dayMap.keys()]);

  return [...keys]
    .map((key) => {
      if (dayMap.has(key)) {
        const derived = dayMap.get(key);
        derived.amount = Math.round(derived.amount * 100) / 100;
        derived.isOverridden = manualMap.has(key);
        return derived;
      }

      const manual = manualMap.get(key);
      return {
        ...manual,
        derivedFrom: 'month',
        isOverridden: false
      };
    })
    .sort((left, right) => right.period.localeCompare(left.period) || right.channel.localeCompare(left.channel));
}

function buildEffectiveYearRecords(receipts) {
  const months = buildEffectiveMonthRecords(receipts);
  const yearMap = new Map();

  for (const item of months) {
    const yearPeriod = item.period.slice(0, 4);
    const key = `${item.channel}__${yearPeriod}`;
    const current = yearMap.get(key) || {
      id: `derived-${item.channel}-${yearPeriod}`,
      channel: item.channel,
      granularity: 'year',
      period: yearPeriod,
      date: `${yearPeriod}-01-01`,
      amount: 0,
      people: 0,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      derivedFrom: 'month'
    };

    current.amount += Number(item.amount);
    current.people += Number(item.people);
    if (item.createdAt < current.createdAt) current.createdAt = item.createdAt;
    if (item.updatedAt > current.updatedAt) current.updatedAt = item.updatedAt;
    yearMap.set(key, current);
  }

  return [...yearMap.values()]
    .map((item) => ({
      ...item,
      amount: Math.round(item.amount * 100) / 100
    }))
    .sort((left, right) => right.period.localeCompare(left.period) || right.channel.localeCompare(left.channel));
}

function getRecordsForDimension(receipts, dimension) {
  if (dimension === 'day') {
    return receipts
      .filter((item) => item.granularity === 'day')
      .sort((left, right) => right.period.localeCompare(left.period) || right.updatedAt.localeCompare(left.updatedAt));
  }

  if (dimension === 'month') {
    return buildEffectiveMonthRecords(receipts);
  }

  return buildEffectiveYearRecords(receipts);
}

function buildTrend(records, dimension) {
  const groups = new Map();

  for (const item of records) {
    const key = item.period;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([period, items]) => ({
      period,
      parentPeriod: getParentPeriod(dimension, period),
      summary: summarizeReceipts(items)
    }));
}

function validateParentPeriod(granularity, parentPeriod) {
  if (!parentPeriod) return true;
  if (granularity === 'month') return PERIOD_PATTERNS.year.test(parentPeriod);
  if (granularity === 'day') return PERIOD_PATTERNS.month.test(parentPeriod);
  return granularity === 'year';
}

function validateEntryPayload(body) {
  const errors = [];
  const granularity = normalizeGranularity(body.granularity, ENTRY_GRANULARITIES);
  const channel = normalizeChannel(body.channel);
  const period = normalizePeriod(granularity, body.period);
  const amount = Number(body.amount);
  const people = Number(body.people);

  if (!granularity) errors.push('录入粒度必须为 month 或 day');
  if (!channel) errors.push('渠道必须为 wechat、alipay 或 cash');
  if (!period) errors.push('周期格式与粒度不匹配');
  if (!Number.isFinite(amount) || amount <= 0) errors.push('收款金额必须为正数');
  if (!Number.isInteger(people) || people <= 0) errors.push('收款人数必须为正整数');

  return {
    errors,
    value: {
      granularity,
      channel,
      period,
      date: granularity && period ? buildDate(granularity, period) : null,
      amount: Math.round(amount * 100) / 100,
      people
    }
  };
}

function hasDayDataForMonth(receipts, channel, monthPeriod, ignoreId = '') {
  return receipts.some(
    (item) =>
      item.id !== ignoreId &&
      item.channel === channel &&
      item.granularity === 'day' &&
      item.period.slice(0, 7) === monthPeriod
  );
}

function validateImportPayload(body) {
  const errors = [];
  const channel = normalizeChannel(body.channel);
  const rows = Array.isArray(body.rows) ? body.rows : [];

  if (!channel) errors.push('导入渠道必须为 wechat、alipay 或 cash');
  if (rows.length === 0) errors.push('导入数据不能为空');
  if (rows.length > 500) errors.push('单次最多导入 500 行');

  const seenPeriods = new Set();
  const values = rows.map((row, index) => {
    const rowNumber = index + 2;
    const period = normalizePeriod('month', String(row.period || row.month || '').trim());
    const amount = Number(row.amount);
    const people = Number(row.people);

    if (!period) errors.push(`第 ${rowNumber} 行月份格式应为 YYYY-MM`);
    if (!Number.isFinite(amount) || amount <= 0) errors.push(`第 ${rowNumber} 行金额必须大于 0`);
    if (!Number.isInteger(people) || people <= 0) errors.push(`第 ${rowNumber} 行人数必须为正整数`);
    if (period && seenPeriods.has(period)) errors.push(`第 ${rowNumber} 行月份 ${period} 重复`);
    if (period) seenPeriods.add(period);

    return {
      channel,
      granularity: 'month',
      period,
      date: period ? buildDate('month', period) : null,
      amount: Math.round(amount * 100) / 100,
      people
    };
  });

  return { errors, values };
}

router.get('/', async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const granularity = req.query.granularity ? normalizeGranularity(req.query.granularity, ENTRY_GRANULARITIES) : null;
    const channel = req.query.channel ? normalizeChannel(req.query.channel) : null;
    const period = granularity && req.query.period ? normalizePeriod(granularity, req.query.period) : null;
    const parentPeriod = req.query.parentPeriod || '';

    if (req.query.granularity && !granularity) return fail(res, 400, '录入台账仅支持 month 或 day');
    if (req.query.channel && !channel) return fail(res, 400, '渠道必须为 wechat、alipay 或 cash');
    if (req.query.period && !period) return fail(res, 400, '周期格式与粒度不匹配');
    if (granularity && !validateParentPeriod(granularity, parentPeriod)) return fail(res, 400, '父级周期格式不正确');

    const receipts = await getUserReceipts(userId);
    const dayMonthSummaryMap = new Map();

    for (const item of receipts) {
      if (item.granularity !== 'day') continue;

      const key = monthKey(item.channel, item.period.slice(0, 7));
      const current = dayMonthSummaryMap.get(key) || { amount: 0, people: 0 };
      current.amount += Number(item.amount);
      current.people += Number(item.people);
      dayMonthSummaryMap.set(key, current);
    }

    const result = receipts
      .filter((item) => (granularity ? item.granularity === granularity : true))
      .filter((item) => (period ? item.period === period : true))
      .filter((item) => (parentPeriod ? getParentPeriod(item.granularity, item.period) === parentPeriod : true))
      .filter((item) => (channel ? item.channel === channel : true))
      .map((item) => {
        const derivedMonth = dayMonthSummaryMap.get(monthKey(item.channel, item.period));
        const isOverridden = item.granularity === 'month' && Boolean(derivedMonth);

        return {
          ...item,
          isOverridden,
          effectiveAmount: isOverridden ? Math.round(derivedMonth.amount * 100) / 100 : null,
          effectivePeople: isOverridden ? derivedMonth.people : null
        };
      })
      .sort((left, right) => right.period.localeCompare(left.period) || right.updatedAt.localeCompare(left.updatedAt));

    ok(res, result);
  } catch (error) {
    next(error);
  }
});

router.get('/single', async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const granularity = normalizeGranularity(req.query.granularity, ENTRY_GRANULARITIES);
    const channel = normalizeChannel(req.query.channel);
    const period = normalizePeriod(granularity, req.query.period);

    if (!granularity) return fail(res, 400, '录入台账仅支持 month 或 day');
    if (!channel) return fail(res, 400, '渠道必须为 wechat、alipay 或 cash');
    if (!period) return fail(res, 400, '周期格式与粒度不匹配');

    const receipts = await getUserReceipts(userId);
    const result = receipts
      .filter((item) => item.granularity === granularity)
      .filter((item) => item.channel === channel)
      .filter((item) => item.period === period)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    ok(res, result);
  } catch (error) {
    next(error);
  }
});

router.get('/summary', async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const dimension = normalizeGranularity(req.query.dimension || 'month');
    const period = req.query.period ? normalizePeriod(dimension, req.query.period) : null;

    if (!dimension) return fail(res, 400, '统计粒度必须为 year、month 或 day');
    if (req.query.period && !period) return fail(res, 400, '周期格式与粒度不匹配');

    const receipts = await getUserReceipts(userId);
    const records = getRecordsForDimension(receipts, dimension);
    const scoped = records.filter((item) => (period ? item.period === period : true));

    ok(res, {
      dimension,
      period: period || 'all',
      summary: summarizeReceipts(scoped)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/trend', async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const dimension = normalizeGranularity(req.query.dimension || 'month');
    const parentPeriod = req.query.parentPeriod || '';

    if (!dimension) return fail(res, 400, '统计粒度必须为 year、month 或 day');
    if (!validateParentPeriod(dimension, parentPeriod)) return fail(res, 400, '父级周期格式不正确');

    const receipts = await getUserReceipts(userId);
    const records = getRecordsForDimension(receipts, dimension)
      .filter((item) => (parentPeriod ? getParentPeriod(dimension, item.period) === parentPeriod : true));

    ok(res, buildTrend(records, dimension));
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const { errors, value } = validateEntryPayload(req.body);
    if (errors.length) return fail(res, 400, errors.join('；'));

    const allReceipts = await getSourceReceipts();
    const receipts = allReceipts.filter((item) => item.userId === userId);
    const duplicated = receipts.find(
      (item) =>
        item.channel === value.channel &&
        item.granularity === value.granularity &&
        item.period === value.period
    );
    if (duplicated) return fail(res, 409, '相同渠道与周期的数据已存在，请直接编辑');

    if (
      value.granularity === 'month' &&
      hasDayDataForMonth(receipts, value.channel, value.period)
    ) {
      return fail(res, 409, '该月已有日数据，月统计将自动汇总日数据，不支持再录入月数据');
    }

    const now = new Date().toISOString();
    const receipt = {
      id: nanoid(10),
      userId,
      ...value,
      createdAt: now,
      updatedAt: now
    };

    receipts.push(receipt);
    await writeReceipts(mergeUserReceipts(allReceipts, userId, receipts));
    ok(res, receipt, '新增成功');
  } catch (error) {
    next(error);
  }
});

router.post('/import', async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const { errors, values } = validateImportPayload(req.body);
    if (errors.length) return fail(res, 400, errors.join('；'));

    const allReceipts = await getSourceReceipts();
    const receipts = allReceipts.filter((item) => item.userId === userId);
    const blocked = values.filter((item) => hasDayDataForMonth(receipts, item.channel, item.period));
    if (blocked.length) {
      return fail(res, 409, `以下月份已有日数据，不能导入月数据：${blocked.map((item) => item.period).join('、')}`);
    }

    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;

    for (const value of values) {
      const index = receipts.findIndex(
        (item) =>
          item.channel === value.channel &&
          item.granularity === value.granularity &&
          item.period === value.period
      );

      if (index === -1) {
        receipts.push({
          id: nanoid(10),
          userId,
          ...value,
          createdAt: now,
          updatedAt: now
        });
        created += 1;
      } else {
        receipts[index] = {
          ...receipts[index],
          ...value,
          updatedAt: now
        };
        updated += 1;
      }
    }

    await writeReceipts(mergeUserReceipts(allReceipts, userId, receipts));
    ok(res, { created, updated, total: values.length }, '导入成功');
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const { errors, value } = validateEntryPayload(req.body);
    if (errors.length) return fail(res, 400, errors.join('；'));

    const allReceipts = await getSourceReceipts();
    const receipts = allReceipts.filter((item) => item.userId === userId);
    const index = receipts.findIndex((item) => item.id === req.params.id);
    if (index === -1) return fail(res, 404, '数据不存在');

    const duplicated = receipts.find(
      (item) =>
        item.id !== req.params.id &&
        item.channel === value.channel &&
        item.granularity === value.granularity &&
        item.period === value.period
    );
    if (duplicated) return fail(res, 409, '相同渠道与周期的数据已存在，请直接编辑原记录');

    if (
      value.granularity === 'month' &&
      hasDayDataForMonth(receipts, value.channel, value.period, req.params.id)
    ) {
      return fail(res, 409, '该月已有日数据，月统计将自动汇总日数据，不支持再录入月数据');
    }

    receipts[index] = {
      ...receipts[index],
      ...value,
      updatedAt: new Date().toISOString()
    };

    await writeReceipts(mergeUserReceipts(allReceipts, userId, receipts));
    ok(res, receipts[index], '修改成功');
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    const allReceipts = await getSourceReceipts();
    const receipts = allReceipts.filter((item) => item.userId === userId);
    const nextReceipts = receipts.filter((item) => item.id !== req.params.id);
    if (nextReceipts.length === receipts.length) return fail(res, 404, '数据不存在');

    await writeReceipts(mergeUserReceipts(allReceipts, userId, nextReceipts));
    ok(res, { id: req.params.id }, '删除成功');
  } catch (error) {
    next(error);
  }
});

export default router;
