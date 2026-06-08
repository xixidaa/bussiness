import { seedReceipts } from '../../server/src/seed-data.js';

const CHANNELS = new Set(['wechat', 'alipay']);
const ANALYTICS_GRANULARITIES = new Set(['year', 'month', 'day']);
const ENTRY_GRANULARITIES = new Set(['month', 'day']);
const PERIOD_PATTERNS = {
  year: /^\d{4}$/,
  month: /^\d{4}-(0[1-9]|1[0-2])$/,
  day: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
};

const SCHEMA_SQL = [
  'CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, channel TEXT NOT NULL, granularity TEXT NOT NULL, period TEXT NOT NULL, date TEXT NOT NULL, amount REAL NOT NULL, people INTEGER NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, UNIQUE(channel, granularity, period))',
  'CREATE INDEX IF NOT EXISTS idx_receipts_granularity_period ON receipts (granularity, period)',
  'CREATE INDEX IF NOT EXISTS idx_receipts_channel_period ON receipts (channel, period)'
];

let initPromise;

function json(data = null, message = 'success', code = 0, status = 200) {
  return Response.json({ code, message, data }, { status });
}

function fail(status, message) {
  return json(null, message, status, status);
}

export function requireDatabase(env) {
  if (!env?.DB) {
    return fail(500, 'D1 binding DB is not configured');
  }

  return env.DB;
}

export async function withErrorHandling(task) {
  try {
    return await task();
  } catch (error) {
    return fail(500, error?.message || 'Internal server error');
  }
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

function summarizeReceipts(receipts) {
  const summary = {
    wechat: { amount: 0, people: 0 },
    alipay: { amount: 0, people: 0 },
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

function monthKey(channel, period) {
  return `${channel}__${period}`;
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
  if (!channel) errors.push('渠道必须为 wechat 或 alipay');
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

  if (!channel) errors.push('导入渠道必须为 wechat 或 alipay');
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

async function ensureSchema(db) {
  for (const statement of SCHEMA_SQL) {
    await db.prepare(statement).run();
  }
}

async function seedIfNeeded(db) {
  const { results } = await db.prepare('SELECT COUNT(*) AS count FROM receipts').run();
  const count = Number(results?.[0]?.count || 0);
  if (count > 0) return;

  const statements = seedReceipts.map((item) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO receipts
          (id, channel, granularity, period, date, amount, people, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        item.id,
        item.channel,
        item.granularity,
        item.period,
        item.date,
        item.amount,
        item.people,
        item.createdAt,
        item.updatedAt
      )
  );

  if (statements.length > 0) {
    await db.batch(statements);
  }
}

export async function ensureDatabase(db) {
  if (!initPromise) {
    initPromise = (async () => {
      await ensureSchema(db);
      await seedIfNeeded(db);
    })();
  }

  await initPromise;
}

async function readReceipts(db) {
  const { results } = await db
    .prepare('SELECT * FROM receipts ORDER BY period DESC, updatedAt DESC')
    .run();
  return Array.isArray(results) ? results : [];
}

async function writeReceipts(db, receipts) {
  await db.exec('DELETE FROM receipts');
  if (receipts.length === 0) return;

  const statements = receipts.map((item) =>
    db
      .prepare(
        `INSERT INTO receipts
          (id, channel, granularity, period, date, amount, people, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        item.id,
        item.channel,
        item.granularity,
        item.period,
        item.date,
        item.amount,
        item.people,
        item.createdAt,
        item.updatedAt
      )
  );

  await db.batch(statements);
}

function attachDerivedMonthFlags(receipts) {
  const overriddenMonthKeys = new Set(
    receipts
      .filter((item) => item.granularity === 'day')
      .map((item) => monthKey(item.channel, item.period.slice(0, 7)))
  );

  return receipts.map((item) => ({
    ...item,
    isOverridden: item.granularity === 'month' && overriddenMonthKeys.has(monthKey(item.channel, item.period))
  }));
}

export async function handleHealth() {
  return json({ status: 'running' });
}

export async function handleList(db, request) {
  const url = new URL(request.url);
  const granularity = url.searchParams.get('granularity')
    ? normalizeGranularity(url.searchParams.get('granularity'), ENTRY_GRANULARITIES)
    : null;
  const channel = url.searchParams.get('channel') ? normalizeChannel(url.searchParams.get('channel')) : null;
  const period = granularity && url.searchParams.get('period') ? normalizePeriod(granularity, url.searchParams.get('period')) : null;
  const parentPeriod = url.searchParams.get('parentPeriod') || '';

  if (url.searchParams.has('granularity') && !granularity) return fail(400, '录入台账仅支持 month 或 day');
  if (url.searchParams.has('channel') && !channel) return fail(400, '渠道必须为 wechat 或 alipay');
  if (url.searchParams.has('period') && !period) return fail(400, '周期格式与粒度不匹配');
  if (granularity && !validateParentPeriod(granularity, parentPeriod)) return fail(400, '父级周期格式不正确');

  const receipts = await readReceipts(db);
  const result = attachDerivedMonthFlags(receipts)
    .filter((item) => (granularity ? item.granularity === granularity : true))
    .filter((item) => (period ? item.period === period : true))
    .filter((item) => (parentPeriod ? getParentPeriod(item.granularity, item.period) === parentPeriod : true))
    .filter((item) => (channel ? item.channel === channel : true))
    .sort((left, right) => right.period.localeCompare(left.period) || right.updatedAt.localeCompare(left.updatedAt));

  return json(result);
}

export async function handleSingle(db, request) {
  const url = new URL(request.url);
  const granularity = normalizeGranularity(url.searchParams.get('granularity'), ENTRY_GRANULARITIES);
  const channel = normalizeChannel(url.searchParams.get('channel'));
  const period = normalizePeriod(granularity, url.searchParams.get('period'));

  if (!granularity) return fail(400, '录入台账仅支持 month 或 day');
  if (!channel) return fail(400, '渠道必须为 wechat 或 alipay');
  if (!period) return fail(400, '周期格式与粒度不匹配');

  const receipts = await readReceipts(db);
  const result = receipts
    .filter((item) => item.granularity === granularity)
    .filter((item) => item.channel === channel)
    .filter((item) => item.period === period)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return json(result);
}

export async function handleSummary(db, request) {
  const url = new URL(request.url);
  const dimension = normalizeGranularity(url.searchParams.get('dimension') || 'month');
  const period = url.searchParams.get('period') ? normalizePeriod(dimension, url.searchParams.get('period')) : null;

  if (!dimension) return fail(400, '统计粒度必须为 year、month 或 day');
  if (url.searchParams.has('period') && !period) return fail(400, '周期格式与粒度不匹配');

  const receipts = await readReceipts(db);
  const records = getRecordsForDimension(receipts, dimension);
  const scoped = records.filter((item) => (period ? item.period === period : true));

  return json({
    dimension,
    period: period || 'all',
    summary: summarizeReceipts(scoped)
  });
}

export async function handleTrend(db, request) {
  const url = new URL(request.url);
  const dimension = normalizeGranularity(url.searchParams.get('dimension') || 'month');
  const parentPeriod = url.searchParams.get('parentPeriod') || '';

  if (!dimension) return fail(400, '统计粒度必须为 year、month 或 day');
  if (!validateParentPeriod(dimension, parentPeriod)) return fail(400, '父级周期格式不正确');

  const receipts = await readReceipts(db);
  const records = getRecordsForDimension(receipts, dimension).filter((item) =>
    parentPeriod ? getParentPeriod(dimension, item.period) === parentPeriod : true
  );

  return json(buildTrend(records, dimension));
}

export async function handleCreate(db, request) {
  const body = await request.json().catch(() => null);
  const { errors, value } = validateEntryPayload(body || {});
  if (errors.length) return fail(400, errors.join('；'));

  const receipts = await readReceipts(db);
  const duplicated = receipts.find(
    (item) =>
      item.channel === value.channel &&
      item.granularity === value.granularity &&
      item.period === value.period
  );
  if (duplicated) return fail(409, '相同渠道与周期的数据已存在，请直接编辑');

  if (value.granularity === 'month' && hasDayDataForMonth(receipts, value.channel, value.period)) {
    return fail(409, '该月已有日数据，月统计将自动汇总日数据，不支持再录入月数据');
  }

  const now = new Date().toISOString();
  const receipt = {
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 10),
    ...value,
    createdAt: now,
    updatedAt: now
  };

  receipts.push(receipt);
  await writeReceipts(db, receipts);
  return json(receipt, '新增成功');
}

export async function handleImport(db, request) {
  const body = await request.json().catch(() => null);
  const { errors, values } = validateImportPayload(body || {});
  if (errors.length) return fail(400, errors.join('；'));

  const receipts = await readReceipts(db);
  const blocked = values.filter((item) => hasDayDataForMonth(receipts, item.channel, item.period));
  if (blocked.length) {
    return fail(409, `以下月份已有日数据，不能导入月数据：${blocked.map((item) => item.period).join('、')}`);
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
        id: crypto.randomUUID().replace(/-/g, '').slice(0, 10),
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

  await writeReceipts(db, receipts);
  return json({ created, updated, total: values.length }, '导入成功');
}

export async function handleUpdate(db, request, id) {
  const body = await request.json().catch(() => null);
  const { errors, value } = validateEntryPayload(body || {});
  if (errors.length) return fail(400, errors.join('；'));

  const receipts = await readReceipts(db);
  const index = receipts.findIndex((item) => item.id === id);
  if (index === -1) return fail(404, '数据不存在');

  const duplicated = receipts.find(
    (item) =>
      item.id !== id &&
      item.channel === value.channel &&
      item.granularity === value.granularity &&
      item.period === value.period
  );
  if (duplicated) return fail(409, '相同渠道与周期的数据已存在，请直接编辑原记录');

  if (value.granularity === 'month' && hasDayDataForMonth(receipts, value.channel, value.period, id)) {
    return fail(409, '该月已有日数据，月统计将自动汇总日数据，不支持再录入月数据');
  }

  receipts[index] = {
    ...receipts[index],
    ...value,
    updatedAt: new Date().toISOString()
  };

  await writeReceipts(db, receipts);
  return json(receipts[index], '修改成功');
}

export async function handleDelete(db, id) {
  const receipts = await readReceipts(db);
  const nextReceipts = receipts.filter((item) => item.id !== id);
  if (nextReceipts.length === receipts.length) return fail(404, '数据不存在');

  await writeReceipts(db, nextReceipts);
  return json({ id }, '删除成功');
}
