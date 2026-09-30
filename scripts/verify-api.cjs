/* 只在明确指定的隔离 MongoDB 上验证真实 Express 接口。 */
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
if (process.env.QA_ISOLATED_ENV !== '1' || !process.env.QA_MONGODB_URI) {
  console.error('必须设置 QA_ISOLATED_ENV=1 和 QA_MONGODB_URI，避免测试写入正式数据库。');
  process.exit(1);
}
const base = process.env.QA_API_URL || 'http://127.0.0.1:3001/api';
const userId = `api-qa-${Date.now().toString(36)}`;
const headers = { 'Content-Type': 'application/json', 'X-User-Id': userId };
let assertions = 0;
async function call(method, route, data, status = 200) {
  const response = await fetch(`${base}${route}`, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await response.json();
  assert.equal(response.status, status, JSON.stringify(result));
  assertions++;
  return result.data;
}
const entry = (period, amount, extra = {}) => ({ granularity: 'day', channel: 'cash', period, amount, people: 2, remark: '', attachmentStatus: 'none', ...extra });
(async () => {
  await call('POST', '/users', { id: userId, name: userId, password: 'Api-QA-Isolated-2026' });
  const original = await call('POST', '/receipts', entry('2026-04-12', 125.50));
  await call('POST', '/receipts', entry('2026-04-12', 24.50), 409);
  await call('POST', '/receipts', entry('2026-04-12', 24.50, { appendToExisting: true, existingId: original.id, expectedUpdatedAt: 'stale' }), 409);
  const appended = await call('POST', '/receipts', entry('2026-04-12', 24.50, { appendToExisting: true, existingId: original.id, expectedUpdatedAt: original.updatedAt }));
  assert.equal(appended.amount, 150); assert.equal(appended.people, 4); assertions += 2;
  await call('POST', '/receipts', entry('2026-04-12', 20, { appendToExisting: true, existingId: original.id, expectedUpdatedAt: original.updatedAt }), 409);

  const rows = [entry('2026-04-12', 175), entry('2026-04-13', 40)];
  const preview = await call('POST', '/receipts/import', { rows, preview: true });
  assert.equal(preview.counts.conflict, 1); assert.equal(preview.counts.new, 1); assert.equal(preview.rows[0].difference, 25); assertions += 3;
  assert.equal((await call('GET', '/receipts/single?granularity=day&channel=cash&period=2026-04-12'))[0].amount, 150); assertions++;
  await call('POST', '/receipts/import', { rows, previewToken: preview.previewToken }, 409);
  assert.equal((await call('GET', '/receipts/single?granularity=day&channel=cash&period=2026-04-13')).length, 0); assertions++;
  await call('POST', '/receipts/import', { rows, previewToken: preview.previewToken, confirmed: true });
  const duplicate = await call('POST', '/receipts/import', { rows, preview: true });
  assert.equal(duplicate.counts.duplicate, 2); assertions++;
  const repeated = await call('POST', '/receipts/import', { rows, previewToken: duplicate.previewToken, confirmed: true });
  assert.equal(repeated.created, 0); assert.equal(repeated.updated, 0); assert.equal(repeated.skipped, 2); assertions += 3;

  const staleRows = [entry('2026-04-12', 199), entry('2026-04-14', 51)];
  const stalePreview = await call('POST', '/receipts/import', { rows: staleRows, preview: true });
  const current = (await call('GET', '/receipts/single?granularity=day&channel=cash&period=2026-04-12'))[0];
  await call('PUT', `/receipts/${current.id}`, entry('2026-04-12', 176));
  await call('POST', '/receipts/import', { rows: staleRows, previewToken: stalePreview.previewToken, confirmed: true }, 409);
  assert.equal((await call('GET', '/receipts/single?granularity=day&channel=cash&period=2026-04-14')).length, 0); assertions++;
  await call('POST', '/receipts/import', { rows: [entry('2026-04-15', 55), entry('2026-04-15', 66)], preview: true }, 400);
  const mixed = [entry('2026-05', 900, { granularity: 'month' }), entry('2026-05-11', 30)];
  const blocked = await call('POST', '/receipts/import', { rows: mixed, preview: true });
  assert.equal(blocked.blocked, true); assertions++;
  await call('POST', '/receipts/import', { rows: mixed, previewToken: blocked.previewToken, confirmed: true }, 409);
  assert.equal((await call('GET', '/receipts/single?granularity=day&channel=cash&period=2026-05-11')).length, 0); assertions++;

  // 日明细覆盖同渠道月汇总，月统计不得相加。
  await call('POST', '/receipts', entry('2026-03', 900, { granularity: 'month' }));
  await call('POST', '/receipts', entry('2026-03-11', 30));
  const month = await call('GET', '/receipts/summary?dimension=month&period=2026-03');
  assert.equal(month.summary.total.amount, 30); assertions++;
  const overridden = (await call('GET', '/receipts/single?granularity=month&channel=cash&period=2026-03'))[0];
  await call('POST', '/receipts', entry('2026-03', 25, { granularity: 'month', appendToExisting: true, existingId: overridden.id, expectedUpdatedAt: overridden.updatedAt }), 409);
  assert.equal((await call('GET', '/receipts/single?granularity=month&channel=cash&period=2026-03'))[0].amount, 900); assertions++;
  const { MongoClient } = require(path.join(process.cwd(), 'server/node_modules/mongodb'));
  const client = new MongoClient(process.env.QA_MONGODB_URI);
  try {
    await client.connect();
    const db = client.db();
    const defaultAdminReceipts = await db.collection('receipts').countDocuments({ userId: 'admin' });
    assert.equal(defaultAdminReceipts, 0, '空库启动不能插入演示收款'); assertions++;
    const salt = 'isolated-qa-only';
    const hash = createHash('sha256').update(`${salt}:Custom-Admin-QA-2026`).digest('hex');
    await db.collection('users').updateOne({ id: 'admin' }, { $set: { passwordSalt: salt, passwordHash: hash } });
    const boot = spawnSync(process.execPath, ['--input-type=module', '-e', "const s=await import('./server/src/storage.js');await s.ensureDataFile();await s.closeStorage();"], {
      cwd: process.cwd(), env: { ...process.env, MONGODB_URI: process.env.QA_MONGODB_URI }, encoding: 'utf8', timeout: 30000
    });
    assert.equal(boot.status, 0, boot.stderr); assertions++;
    const admin = await db.collection('users').findOne({ id: 'admin' });
    assert.equal(admin.passwordHash, hash, '重新初始化不能修改已有管理员密码'); assertions++;
    await call('POST', '/users/login', { account: 'admin', password: 'Custom-Admin-QA-2026' });
    await call('POST', '/users/login', { account: 'admin', password: 'admin123' }, 401);
  } finally { await client.close(); }
  console.log(JSON.stringify({ status: 'passed', assertions, checks: ['累计需确认和版本匹配', '导入预览不写入', '冲突未确认整批拒绝', '重复导入跳过', '预览失效拒绝', '日月冲突无写入', '统计去重', '无演示收款', '保留已有密码'] }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
