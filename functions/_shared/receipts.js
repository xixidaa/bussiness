import { seedReceipts } from '../../server/src/seed-data.js';

const DEFAULT_USER = {
  id: 'admin',
  name: '\u7ba1\u7406\u5458',
  role: 'admin'
};

const DEFAULT_PASSWORD = 'admin123';
const DEFAULT_PASSWORD_SALT = 'merchant-ledger-default-admin';
const CHANNEL_KEYS = ['wechat', 'alipay', 'cash', 'other'];
const CHANNELS = new Set(CHANNEL_KEYS);
const ANALYTICS_GRANULARITIES = new Set(['year', 'month', 'day']);
const ENTRY_GRANULARITIES = new Set(['month', 'day']);
const ATTACHMENT_STATUSES = new Set(['none', 'uploaded', 'pending']);
const PERIOD_PATTERNS = {
  year: /^\d{4}$/,
  month: /^\d{4}-(0[1-9]|1[0-2])$/,
  day: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
};

const TABLE_SQL = [
  'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, passwordHash TEXT NOT NULL DEFAULT "", passwordSalt TEXT NOT NULL DEFAULT "", createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, userId TEXT NOT NULL DEFAULT "admin", channel TEXT NOT NULL, granularity TEXT NOT NULL, period TEXT NOT NULL, date TEXT NOT NULL, amount REAL NOT NULL, people INTEGER NOT NULL, entryMode TEXT NOT NULL DEFAULT "manual", remark TEXT NOT NULL DEFAULT "", attachmentStatus TEXT NOT NULL DEFAULT "none", createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, UNIQUE(userId, channel, granularity, period))'
];

const INDEX_SQL = [
  'CREATE INDEX IF NOT EXISTS idx_receipts_user_granularity_period ON receipts (userId, granularity, period)',
  'CREATE INDEX IF NOT EXISTS idx_receipts_user_channel_period ON receipts (userId, channel, period)',
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

function normalizeUserId(value) {
  const text = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{2,32}$/.test(text) ? text : '';
}

function normalizeUserName(value) {
  return String(value || '').trim().slice(0, 24);
}

function normalizePassword(value) {
  return String(value || '');
}

function normalizeEntryMode(value) {
  return value === 'import' ? 'import' : 'manual';
}

function normalizeAttachmentStatus(value) {
  return ATTACHMENT_STATUSES.has(value) ? value : 'none';
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

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password, salt = crypto.randomUUID().replace(/-/g, '').slice(0, 24)) {
  return {
    passwordSalt: salt,
    passwordHash: await sha256(`${salt}:${password}`)
  };
}

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, passwordSalt, ...safeUser } = user;
  return safeUser;
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
  const summary = Object.fromEntries(CHANNEL_KEYS.map((key) => [key, { amount: 0, people: 0 }]));
  summary.total = { amount: 0, people: 0 };

  for (const item of receipts) {
    if (!summary[item.channel]) continue;
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
      userId: item.userId,
      channel: item.channel,
      granularity: 'month',
      period: monthPeriod,
      date: `${monthPeriod}-01`,
      amount: 0,
      people: 0,
      entryMode: item.entryMode || 'manual',
      remark: '',
      attachmentStatus: 'none',
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
      userId: item.userId,
      channel: item.channel,
      granularity: 'year',
      period: yearPeriod,
      date: `${yearPeriod}-01-01`,
      amount: 0,
      people: 0,
      entryMode: item.entryMode || 'manual',
      remark: '',
      attachmentStatus: 'none',
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
  if (!channel) errors.push('渠道必须为 wechat、alipay、cash 或 other');
  if (!period) errors.push('日期格式与粒度不匹配');
  if (!Number.isFinite(amount) || amount <= 0) errors.push('收款金额必须大于 0');
  if (!Number.isInteger(people) || people < 0) errors.push('收款人数不可为负');

  return {
    errors,
    value: {
      granularity,
      channel,
      period,
      date: granularity && period ? buildDate(granularity, period) : null,
      amount: Math.round(amount * 100) / 100,
      people,
      entryMode: normalizeEntryMode(body.entryMode),
      remark: String(body.remark || '').trim().slice(0, 200),
      attachmentStatus: normalizeAttachmentStatus(body.attachmentStatus)
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
  const rows = Array.isArray(body.rows) ? body.rows : [];

  if (rows.length === 0) errors.push('导入数据不能为空');
  if (rows.length > 500) errors.push('单次最多导入 500 行');

  const seenKeys = new Set();
  const values = rows.map((row, index) => {
    const rowNumber = index + 2;
    const granularity = normalizeGranularity(row.granularity || 'month', ENTRY_GRANULARITIES);
    const channel = normalizeChannel(row.channel || body.channel);
    const period = normalizePeriod(granularity, String(row.period || row.month || '').trim());
    const amount = Number(row.amount);
    const people = Number(row.people);
    const duplicateKey = `${granularity || ''}__${channel || ''}__${period || ''}`;

    if (!granularity) errors.push(`第 ${rowNumber} 行粒度必须为 month 或 day`);
    if (!channel) errors.push(`第 ${rowNumber} 行渠道必须为 wechat、alipay、cash 或 other`);
    if (!period) errors.push(`第 ${rowNumber} 行日期格式与粒度不匹配`);
    if (!Number.isFinite(amount) || amount <= 0) errors.push(`第 ${rowNumber} 行金额必须大于 0`);
    if (!Number.isInteger(people) || people < 0) errors.push(`第 ${rowNumber} 行人数不可为负`);
    if (period && channel && granularity && seenKeys.has(duplicateKey)) errors.push(`第 ${rowNumber} 行记录重复`);
    if (period && channel && granularity) seenKeys.add(duplicateKey);

    return {
      channel,
      granularity,
      period,
      date: granularity && period ? buildDate(granularity, period) : null,
      amount: Math.round(amount * 100) / 100,
      people,
      entryMode: 'import',
      remark: String(row.remark || '').trim().slice(0, 200),
      attachmentStatus: normalizeAttachmentStatus(row.attachmentStatus)
    };
  });

  return { errors, values };
}

async function ensureSchema(db) {
  for (const statement of TABLE_SQL) {
    await db.prepare(statement).run();
  }

  await migrateUsersTable(db);
  await migrateReceiptsTable(db);

  for (const statement of INDEX_SQL) {
    await db.prepare(statement).run();
  }

  await ensureDefaultUser(db);
}

async function tableColumns(db, tableName) {
  const { results } = await db.prepare(`PRAGMA table_info('${tableName}')`).run();
  return Array.isArray(results) ? results.map((item) => item.name) : [];
}

async function uniqueIndexColumns(db, tableName) {
  const { results } = await db.prepare(`PRAGMA index_list('${tableName}')`).run();
  const indexes = Array.isArray(results) ? results.filter((item) => Number(item.unique) === 1) : [];
  const columns = [];

  for (const item of indexes) {
    const indexName = item.name;
    const info = await db.prepare(`PRAGMA index_info('${indexName}')`).run();
    columns.push((info.results || []).map((column) => column.name));
  }

  return columns;
}

async function hasUserScopedUniqueIndex(db) {
  const indexes = await uniqueIndexColumns(db, 'receipts');
  return indexes.some((columns) => columns.join(',') === 'userId,channel,granularity,period');
}

async function migrateUsersTable(db) {
  const columns = await tableColumns(db, 'users');
  if (columns.length === 0) return;

  if (!columns.includes('passwordHash')) {
    await db.prepare('ALTER TABLE users ADD COLUMN passwordHash TEXT NOT NULL DEFAULT ""').run();
  }
  if (!columns.includes('passwordSalt')) {
    await db.prepare('ALTER TABLE users ADD COLUMN passwordSalt TEXT NOT NULL DEFAULT ""').run();
  }
}

async function migrateReceiptsTable(db) {
  const columns = await tableColumns(db, 'receipts');
  if (columns.length === 0) return;

  const needsUserColumn = !columns.includes('userId');
  const needsEntryModeColumn = !columns.includes('entryMode');
  const needsRemarkColumn = !columns.includes('remark');
  const needsAttachmentColumn = !columns.includes('attachmentStatus');
  const needsScopedUniqueIndex = !(await hasUserScopedUniqueIndex(db));
  if (
    !needsUserColumn &&
    !needsEntryModeColumn &&
    !needsRemarkColumn &&
    !needsAttachmentColumn &&
    !needsScopedUniqueIndex
  ) {
    return;
  }

  await db.prepare('DROP TABLE IF EXISTS receipts_migrating').run();
  await db.prepare(TABLE_SQL[1].replace('CREATE TABLE IF NOT EXISTS receipts', 'CREATE TABLE receipts_migrating')).run();

  const userIdExpression = needsUserColumn ? `'${DEFAULT_USER.id}'` : `COALESCE(NULLIF(userId, ''), '${DEFAULT_USER.id}')`;
  const entryModeExpression = needsEntryModeColumn ? "'manual'" : "COALESCE(NULLIF(entryMode, ''), 'manual')";
  const remarkExpression = needsRemarkColumn ? "''" : "COALESCE(remark, '')";
  const attachmentExpression = needsAttachmentColumn ? "'none'" : "COALESCE(NULLIF(attachmentStatus, ''), 'none')";

  await db
    .prepare(
      `INSERT OR IGNORE INTO receipts_migrating
        (id, userId, channel, granularity, period, date, amount, people, entryMode, remark, attachmentStatus, createdAt, updatedAt)
       SELECT id, ${userIdExpression}, channel, granularity, period, date, amount, people, ${entryModeExpression}, ${remarkExpression}, ${attachmentExpression}, createdAt, updatedAt
       FROM receipts`
    )
    .run();

  await db.prepare('DROP TABLE receipts').run();
  await db.prepare('ALTER TABLE receipts_migrating RENAME TO receipts').run();
}

async function ensureDefaultUser(db) {
  const now = new Date().toISOString();
  const password = await hashPassword(DEFAULT_PASSWORD, DEFAULT_PASSWORD_SALT);
  await db
    .prepare(
      `INSERT INTO users (id, name, role, passwordHash, passwordSalt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         role = excluded.role,
         passwordHash = excluded.passwordHash,
         passwordSalt = excluded.passwordSalt,
         updatedAt = excluded.updatedAt`
    )
    .bind(DEFAULT_USER.id, DEFAULT_USER.name, DEFAULT_USER.role, password.passwordHash, password.passwordSalt, now, now)
    .run();
}

async function seedIfNeeded(db) {
  const { results } = await db.prepare('SELECT COUNT(*) AS count FROM receipts').run();
  const count = Number(results?.[0]?.count || 0);
  if (count > 0) return;

  const statements = seedReceipts.map((item) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO receipts
          (id, userId, channel, granularity, period, date, amount, people, entryMode, remark, attachmentStatus, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        item.id,
        item.userId || DEFAULT_USER.id,
        item.channel,
        item.granularity,
        item.period,
        item.date,
        item.amount,
        item.people,
        normalizeEntryMode(item.entryMode),
        item.remark || '',
        normalizeAttachmentStatus(item.attachmentStatus),
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
  const { results } = await db.prepare('SELECT * FROM receipts ORDER BY period DESC, updatedAt DESC').run();
  return Array.isArray(results)
    ? results.map((item) => ({
        ...item,
        userId: normalizeUserId(item.userId) || DEFAULT_USER.id,
        entryMode: normalizeEntryMode(item.entryMode),
        remark: item.remark || '',
        attachmentStatus: normalizeAttachmentStatus(item.attachmentStatus)
      }))
    : [];
}

async function writeReceipts(db, receipts) {
  await db.exec('DELETE FROM receipts');
  if (receipts.length === 0) return;

  const statements = receipts.map((item) =>
    db
      .prepare(
        `INSERT INTO receipts
          (id, userId, channel, granularity, period, date, amount, people, entryMode, remark, attachmentStatus, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        item.id,
        item.userId || DEFAULT_USER.id,
        item.channel,
        item.granularity,
        item.period,
        item.date,
        item.amount,
        item.people,
        normalizeEntryMode(item.entryMode),
        item.remark || '',
        normalizeAttachmentStatus(item.attachmentStatus),
        item.createdAt,
        item.updatedAt
      )
  );

  await db.batch(statements);
}

function userReceipts(receipts, userId) {
  return receipts.filter((item) => item.userId === userId);
}

function mergeUserReceipts(allReceipts, userId, nextReceipts) {
  return [
    ...allReceipts.filter((item) => item.userId !== userId),
    ...nextReceipts.map((item) => ({ ...item, userId }))
  ];
}

async function readUsers(db, includeSecrets = false) {
  const { results } = await db.prepare('SELECT * FROM users ORDER BY role ASC, createdAt ASC').run();
  const users = Array.isArray(results) ? results : [];
  return includeSecrets ? users : users.map(sanitizeUser);
}

async function requireCurrentUser(db, request) {
  const url = new URL(request.url);
  const userId = normalizeUserId(request.headers.get('x-user-id') || url.searchParams.get('userId'));
  if (!userId) return { response: fail(401, '请先登录') };

  const users = await readUsers(db);
  if (!users.some((item) => item.id === userId)) return { response: fail(401, '登录用户不存在') };
  return { userId };
}

function attachDerivedMonthFlags(receipts) {
  const dayMonthSummaryMap = new Map();

  for (const item of receipts) {
    if (item.granularity !== 'day') continue;

    const key = monthKey(item.channel, item.period.slice(0, 7));
    const current = dayMonthSummaryMap.get(key) || { amount: 0, people: 0 };
    current.amount += Number(item.amount);
    current.people += Number(item.people);
    dayMonthSummaryMap.set(key, current);
  }

  return receipts.map((item) => {
    const key = monthKey(item.channel, item.period);
    const isOverridden = item.granularity === 'month' && dayMonthSummaryMap.has(key);
    const derivedMonth = dayMonthSummaryMap.get(key);
    return {
      ...item,
      isOverridden,
      effectiveAmount: isOverridden ? Math.round(derivedMonth.amount * 100) / 100 : null,
      effectivePeople: isOverridden ? derivedMonth.people : null
    };
  });
}

export async function handleHealth() {
  return json({ status: 'running' });
}

export async function handleUsersList(db) {
  return json(await readUsers(db));
}

export async function handleUsersLogin(db, request) {
  const body = await request.json().catch(() => null);
  const account = String(body?.account || body?.userId || '').trim();
  const password = normalizePassword(body?.password);
  if (!account || !password) return fail(400, '请输入账号和密码');

  const users = await readUsers(db, true);
  const user =
    users.find((item) => item.id === account || item.name === account) ||
    (['admin', '\u7ba1\u7406\u5458'].includes(account) ? users.find((item) => item.id === DEFAULT_USER.id) : null);
  if (!user) return fail(401, '账号或密码不正确');

  const expected = await hashPassword(password, user.passwordSalt || '');
  const defaultAdminLogin = user.id === DEFAULT_USER.id && password === DEFAULT_PASSWORD;
  if ((!user.passwordHash || expected.passwordHash !== user.passwordHash) && !defaultAdminLogin) {
    return fail(401, '账号或密码不正确');
  }

  return json(sanitizeUser(user), '登录成功');
}

export async function handleUsersCreate(db, request) {
  const body = await request.json().catch(() => null);
  const name = normalizeUserName(body?.name);
  const id = normalizeUserId(body?.id) || `user-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const password = normalizePassword(body?.password);

  if (!name) return fail(400, '用户名称不能为空');
  if (password.length < 6) return fail(400, '密码至少 6 位');

  const users = await readUsers(db);
  if (users.some((item) => item.id === id || item.name === name)) return fail(409, '用户已存在');

  const now = new Date().toISOString();
  const passwordFields = await hashPassword(password);
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO users (id, name, role, passwordHash, passwordSalt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, name, 'user', passwordFields.passwordHash, passwordFields.passwordSalt, now, now)
    .run();

  if (result.meta?.changes === 0) return fail(409, '用户已存在');

  return json({ id, name, role: 'user', createdAt: now, updatedAt: now }, '新增成功');
}

export async function handleList(db, request) {
  const auth = await requireCurrentUser(db, request);
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const userId = auth.userId;
  const granularity = url.searchParams.get('granularity')
    ? normalizeGranularity(url.searchParams.get('granularity'), ENTRY_GRANULARITIES)
    : null;
  const channel = url.searchParams.get('channel') ? normalizeChannel(url.searchParams.get('channel')) : null;
  const period = granularity && url.searchParams.get('period') ? normalizePeriod(granularity, url.searchParams.get('period')) : null;
  const parentPeriod = url.searchParams.get('parentPeriod') || '';

  if (url.searchParams.has('granularity') && !granularity) return fail(400, '录入台账仅支持 month 或 day');
  if (url.searchParams.has('channel') && !channel) return fail(400, '渠道必须为 wechat、alipay、cash 或 other');
  if (url.searchParams.has('period') && !period) return fail(400, '日期格式与粒度不匹配');
  if (granularity && !validateParentPeriod(granularity, parentPeriod)) return fail(400, '父级日期格式不正确');

  const receipts = userReceipts(await readReceipts(db), userId);
  const result = attachDerivedMonthFlags(receipts)
    .filter((item) => (granularity ? item.granularity === granularity : true))
    .filter((item) => (period ? item.period === period : true))
    .filter((item) => (parentPeriod ? getParentPeriod(item.granularity, item.period) === parentPeriod : true))
    .filter((item) => (channel ? item.channel === channel : true))
    .sort((left, right) => right.period.localeCompare(left.period) || right.updatedAt.localeCompare(left.updatedAt));

  return json(result);
}

export async function handleSingle(db, request) {
  const auth = await requireCurrentUser(db, request);
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const userId = auth.userId;
  const granularity = normalizeGranularity(url.searchParams.get('granularity'), ENTRY_GRANULARITIES);
  const channel = normalizeChannel(url.searchParams.get('channel'));
  const period = normalizePeriod(granularity, url.searchParams.get('period'));

  if (!granularity) return fail(400, '录入台账仅支持 month 或 day');
  if (!channel) return fail(400, '渠道必须为 wechat、alipay、cash 或 other');
  if (!period) return fail(400, '日期格式与粒度不匹配');

  const receipts = userReceipts(await readReceipts(db), userId);
  const result = receipts
    .filter((item) => item.granularity === granularity)
    .filter((item) => item.channel === channel)
    .filter((item) => item.period === period)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return json(result);
}

export async function handleSummary(db, request) {
  const auth = await requireCurrentUser(db, request);
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const userId = auth.userId;
  const dimension = normalizeGranularity(url.searchParams.get('dimension') || 'month');
  const period = url.searchParams.get('period') ? normalizePeriod(dimension, url.searchParams.get('period')) : null;

  if (!dimension) return fail(400, '统计粒度必须为 year、month 或 day');
  if (url.searchParams.has('period') && !period) return fail(400, '日期格式与粒度不匹配');

  const receipts = userReceipts(await readReceipts(db), userId);
  const records = getRecordsForDimension(receipts, dimension);
  const scoped = records.filter((item) => (period ? item.period === period : true));

  return json({
    dimension,
    period: period || 'all',
    summary: summarizeReceipts(scoped)
  });
}

export async function handleTrend(db, request) {
  const auth = await requireCurrentUser(db, request);
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const userId = auth.userId;
  const dimension = normalizeGranularity(url.searchParams.get('dimension') || 'month');
  const parentPeriod = url.searchParams.get('parentPeriod') || '';

  if (!dimension) return fail(400, '统计粒度必须为 year、month 或 day');
  if (!validateParentPeriod(dimension, parentPeriod)) return fail(400, '父级日期格式不正确');

  const receipts = userReceipts(await readReceipts(db), userId);
  const records = getRecordsForDimension(receipts, dimension).filter((item) =>
    parentPeriod ? getParentPeriod(dimension, item.period) === parentPeriod : true
  );

  return json(buildTrend(records, dimension));
}

export async function handleCreate(db, request) {
  const auth = await requireCurrentUser(db, request);
  if (auth.response) return auth.response;
  const userId = auth.userId;
  const body = await request.json().catch(() => null);
  const { errors, value } = validateEntryPayload(body || {});
  if (errors.length) return fail(400, errors.join('；'));

  const allReceipts = await readReceipts(db);
  const receipts = userReceipts(allReceipts, userId);
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
    userId,
    ...value,
    createdAt: now,
    updatedAt: now
  };

  receipts.push(receipt);
  await writeReceipts(db, mergeUserReceipts(allReceipts, userId, receipts));
  return json(receipt, '新增成功');
}

export async function handleImport(db, request) {
  const auth = await requireCurrentUser(db, request);
  if (auth.response) return auth.response;
  const userId = auth.userId;
  const body = await request.json().catch(() => null);
  const { errors, values } = validateImportPayload(body || {});
  if (errors.length) return fail(400, errors.join('；'));

  const allReceipts = await readReceipts(db);
  const receipts = userReceipts(allReceipts, userId);
  const blocked = values.filter((item) => item.granularity === 'month' && hasDayDataForMonth(receipts, item.channel, item.period));
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

  await writeReceipts(db, mergeUserReceipts(allReceipts, userId, receipts));
  return json({ created, updated, total: values.length }, '导入成功');
}

export async function handleUpdate(db, request, id) {
  const auth = await requireCurrentUser(db, request);
  if (auth.response) return auth.response;
  const userId = auth.userId;
  const body = await request.json().catch(() => null);
  const { errors, value } = validateEntryPayload(body || {});
  if (errors.length) return fail(400, errors.join('；'));

  const allReceipts = await readReceipts(db);
  const receipts = userReceipts(allReceipts, userId);
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

  await writeReceipts(db, mergeUserReceipts(allReceipts, userId, receipts));
  return json(receipts[index], '修改成功');
}

export async function handleDelete(db, request, id) {
  const auth = await requireCurrentUser(db, request);
  if (auth.response) return auth.response;
  const userId = auth.userId;
  const allReceipts = await readReceipts(db);
  const receipts = userReceipts(allReceipts, userId);
  const nextReceipts = receipts.filter((item) => item.id !== id);
  if (nextReceipts.length === receipts.length) return fail(404, '数据不存在');

  await writeReceipts(db, mergeUserReceipts(allReceipts, userId, nextReceipts));
  return json({ id }, '删除成功');
}
