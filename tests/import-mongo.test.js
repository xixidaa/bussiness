import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const testUri = process.env.MONGODB_TEST_URI;

test('Mongo隔离验证整批校验、失败补偿、读取隔离和序列锁', { skip: !testUri }, async (t) => {
  // 显式测试地址且强制随机库名，绝不使用业务库。
  const uri = new URL(testUri);
  const testDatabase = `receipt_import_test_${randomUUID().replaceAll('-', '')}`;
  uri.pathname = `/${testDatabase}`;
  process.env.MONGODB_URI = uri.toString();
  const storage = await import('../server/src/storage.js');
  const { default: mongoose } = await import('../server/node_modules/mongoose/index.js');
  await storage.ensureDataFile();
  assert.equal(mongoose.connection.name, testDatabase);
  t.after(async () => { await storage.closeStorage(); });
  const Receipt = mongoose.models.Receipt;
  await Receipt.init();
  const now = '2026-09-20T01:00:00.000Z';
  const makeRow = (id, period, amount, granularity = 'day') => ({ id, userId: 'admin', channel: 'wechat', granularity, period, date: period, amount, people: 2, entryMode: 'manual', remark: '', attachmentStatus: 'none', createdAt: now, updatedAt: now });
  const base = [makeRow('base-1', '2026-09-20', 100), makeRow('base-2', '2026-09-21', 200)];
  await storage.writeReceipts(base);
  await Receipt.create(makeRow('historical-year', '2025', 800, 'year'));
  const read = async () => (await storage.readReceipts()).sort((a, b) => a.id.localeCompare(b.id));
  const original = await read();
  await assert.rejects(storage.writeReceipts([...base, { ...makeRow('invalid', '2026-09-23', 10), channel: 'invalid-channel' }]));
  assert.deepEqual(await read(), original);
  await assert.rejects(storage.writeReceipts([...base, makeRow('different-id-same-key', '2026-09-20', 50)]), /重复记录/);
  assert.deepEqual(await read(), original);
  const actualBulkWrite = Receipt.bulkWrite.bind(Receipt);
  for (const next of [[{ ...base[0], amount: 150 }, base[1], makeRow('new-row', '2026-09-22', 30)], [base[0], makeRow('new-row', '2026-09-22', 30)]]) {
    let failed = false;
    Receipt.bulkWrite = async (operations, options) => {
      if (!failed) { failed = true; await actualBulkWrite([operations[0]], options); throw new Error('模拟部分Mongo写入失败'); }
      return actualBulkWrite(operations, options);
    };
    try { await assert.rejects(storage.writeReceipts(next), /模拟部分Mongo写入失败/); }
    finally { Receipt.bulkWrite = actualBulkWrite; }
    assert.deepEqual(await read(), original);
  }
  let release;
  let entered;
  const barrier = new Promise((resolve) => { entered = resolve; });
  const hold = new Promise((resolve) => { release = resolve; });
  let first = true;
  Receipt.bulkWrite = async (operations, options) => {
    if (first) { first = false; const result = await actualBulkWrite(operations, options); entered(); await hold; return result; }
    return actualBulkWrite(operations, options);
  };
  const pendingWrite = storage.writeReceipts([{ ...base[0], amount: 155 }, base[1]]);
  await barrier;
  let readCompleted = false;
  const pendingRead = read().then((rows) => { readCompleted = true; return rows; });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(readCompleted, false);
  release();
  try { await pendingWrite; }
  finally { Receipt.bulkWrite = actualBulkWrite; }
  assert.equal((await pendingRead).find((item) => item.id === 'base-1').amount, 155);
  assert.ok((await read()).some((item) => item.id === 'historical-year'));
  let unlock;
  const block = new Promise((resolve) => { unlock = resolve; });
  const events = [];
  const taskOne = storage.withReceiptMutation(async () => { events.push('one-start'); await block; events.push('one-end'); });
  const taskTwo = storage.withReceiptMutation(async () => { events.push('two'); });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(events, ['one-start']);
  unlock();
  await Promise.all([taskOne, taskTwo]);
  assert.deepEqual(events, ['one-start', 'one-end', 'two']);

  const { default: express } = await import('../server/node_modules/express/index.js');
  const { default: receiptsRouter } = await import('../server/src/routes/receipts.js');
  const app = express();
  app.use(express.json());
  app.use('/receipts', receiptsRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const post = async (body) => (await fetch(`http://127.0.0.1:${server.address().port}/receipts`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-user-id': 'admin' }, body: JSON.stringify(body) })).json();
  const monthly = await post({ channel: 'alipay', granularity: 'month', period: '2026-08', amount: 500, people: 20 });
  assert.equal(monthly.code, 0);
  assert.equal((await post({ channel: 'alipay', granularity: 'day', period: '2026-08-20', amount: 50, people: 2 })).code, 0);
  const append = await post({ channel: 'alipay', granularity: 'month', period: '2026-08', amount: 25, people: 1, appendToExisting: true, existingId: monthly.data.id, expectedUpdatedAt: monthly.data.updatedAt });
  assert.equal(append.code, 409);
  assert.equal((await read()).find((item) => item.id === monthly.data.id).amount, 500);
});
