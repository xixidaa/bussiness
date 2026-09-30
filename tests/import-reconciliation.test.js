import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { appendToReceipt, applyImportPlan, buildImportPlan, importPreviewToken } from '../shared/import-reconciliation.js';
import { ensureDatabase, handleCreate, handleImport, handleUsersLogin, withErrorHandling } from '../functions/_shared/receipts.js';

// 真正的隔离 SQLite 事务适配器；不连接已有 MongoDB 或 D1 数据。
class D1TestDatabase {
  constructor() { this.sqlite = new DatabaseSync(':memory:'); this.beforeBatch = null; this.failAt = -1; }
  prepare(sql) {
    const database = this;
    return {
      sql, params: [],
      bind(...params) { this.params = params; return this; },
      async run() { return database.run(this); }
    };
  }
  run(statement) {
    const query = this.sqlite.prepare(statement.sql);
    if (/^\s*(SELECT|PRAGMA)/i.test(statement.sql)) return { results: query.all(...statement.params) };
    return { results: [], meta: query.run(...statement.params) };
  }
  async batch(statements) {
    if (this.beforeBatch) { const callback = this.beforeBatch; this.beforeBatch = null; callback(); }
    this.sqlite.exec('BEGIN');
    try {
      const results = statements.map((statement, index) => {
        if (index === this.failAt) throw new Error('模拟批次中途写入失败');
        return this.run(statement);
      });
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
  close() { this.sqlite.close(); }
  receipts() { return this.sqlite.prepare('SELECT * FROM receipts ORDER BY id').all(); }
}

const row = (period = '2026-09-20', amount = 100, channel = 'wechat') => ({ granularity: 'day', period, channel, amount, people: 2, remark: '', entryMode: 'import', attachmentStatus: 'none' });
const existing = (payload = row()) => ({ id: 'original', userId: 'admin', ...payload, createdAt: '2026-09-20T01:00:00.000Z', updatedAt: '2026-09-20T01:00:00.000Z' });
const request = (payload, userId = 'admin') => new Request('https://test.local/api/receipts/import', { method: 'POST', headers: { 'content-type': 'application/json', 'x-user-id': userId }, body: JSON.stringify(payload) });
const invoke = async (handler, db, payload) => (await withErrorHandling(() => handler(db, request(payload)))).json();
const insert = (db, receipt) => db.sqlite.prepare('INSERT INTO receipts (id,userId,channel,granularity,period,date,amount,people,entryMode,remark,attachmentStatus,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(receipt.id,receipt.userId,receipt.channel,receipt.granularity,receipt.period,receipt.granularity === 'month' ? `${receipt.period}-01` : receipt.period,receipt.amount,receipt.people,receipt.entryMode,receipt.remark,receipt.attachmentStatus,receipt.createdAt,receipt.updatedAt);

async function setup(t) {
  const db = new D1TestDatabase();
  t.after(() => db.close());
  await ensureDatabase(db);
  return db;
}

test('文件同键重复均阻断；月汇总和同月日明细不能同时导入', () => {
  const duplicates = buildImportPlan([row(), row(undefined, 200)], []);
  assert.equal(duplicates.counts.fileDuplicate, 2);
  assert.equal(duplicates.blocked, true);
  const mixed = buildImportPlan([{ ...row('2026-09'), granularity: 'month' }, row()], []);
  assert.equal(mixed.rows[0].status, 'blocked');
  assert.equal(mixed.blocked, true);
});

test('差额核对区分同键冲突、完全重复和新增，保留不相关日期渠道', () => {
  const values = [row(undefined, 150), row('2026-09-21', 50, 'cash')];
  const source = [existing(), { ...existing(row('2026-09-22', 60, 'alipay')), id: 'unrelated' }];
  const plan = buildImportPlan(values, source);
  assert.deepEqual(plan.counts, { new: 1, conflict: 1, duplicate: 0, blocked: 0, fileDuplicate: 0 });
  assert.equal(plan.rows[0].difference, 50);
  assert.equal(plan.needsConfirmation, true);
  const applied = applyImportPlan(values, source, plan, 'admin', () => 'new-row', '2026-09-30T00:00:00.000Z');
  assert.equal(applied.find((item) => item.id === 'original').amount, 150);
  assert.equal(applied.find((item) => item.id === 'unrelated').amount, 60);
  assert.equal(buildImportPlan([row()], [existing()]).counts.duplicate, 1);
});

test('预览token绑定用户、导入内容、现有金额和新增台账', async () => {
  const token = await importPreviewToken('admin', [row()], [existing()]);
  assert.notEqual(token, await importPreviewToken('admin', [row(undefined, 200)], [existing()]));
  assert.notEqual(token, await importPreviewToken('other', [row()], [existing()]));
  assert.notEqual(token, await importPreviewToken('admin', [row()], [existing(row(undefined, 150))]));
  assert.notEqual(token, await importPreviewToken('admin', [row()], [existing(), { ...existing(row('2026-09-21')), id: 'later' }]));
});

test('D1空库不灌入演示记录，初始化保留既有管理员密码且默认密码不绕过校验', async (t) => {
  const db = await setup(t);
  assert.equal(db.receipts().length, 0);
  db.sqlite.prepare("UPDATE users SET passwordHash = 'custom-hash', passwordSalt = 'custom-salt' WHERE id = 'admin'").run();
  await ensureDatabase(db);
  assert.equal(db.sqlite.prepare("SELECT passwordHash FROM users WHERE id = 'admin'").get().passwordHash, 'custom-hash');
  const result = await invoke(handleUsersLogin, db, { account: 'admin', password: 'admin123' });
  assert.equal(result.code, 401);
});

test('D1预览不写入；冲突未经确认整批拒绝；确认后替换且重复导入跳过', async (t) => {
  const db = await setup(t);
  insert(db, existing());
  const values = [row(undefined, 150), row('2026-09-21', 20, 'cash')];
  const preview = await invoke(handleImport, db, { rows: values, preview: true });
  assert.equal(preview.code, 0);
  assert.equal(db.receipts().length, 1);
  assert.equal(preview.data.rows[0].difference, 50);
  const blocked = await invoke(handleImport, db, { rows: values, previewToken: preview.data.previewToken });
  assert.equal(blocked.code, 409);
  assert.equal(db.receipts().length, 1);
  assert.equal(db.receipts()[0].amount, 100);
  const saved = await invoke(handleImport, db, { rows: values, previewToken: preview.data.previewToken, confirmed: true });
  assert.deepEqual(saved.data, { created: 1, updated: 1, skipped: 0, total: 2 });
  const repeatedPreview = await invoke(handleImport, db, { rows: values, preview: true });
  assert.equal(repeatedPreview.data.counts.duplicate, 2);
  const before = db.receipts();
  const repeated = await invoke(handleImport, db, { rows: values, previewToken: repeatedPreview.data.previewToken });
  assert.equal(repeated.data.skipped, 2);
  assert.deepEqual(db.receipts(), before);
});

test('D1确认旧token或文件内重复不写入任何一行', async (t) => {
  const db = await setup(t);
  insert(db, existing());
  const values = [row(undefined, 150), row('2026-09-21', 20)];
  const preview = await invoke(handleImport, db, { rows: values, preview: true });
  db.sqlite.prepare("UPDATE receipts SET amount = 120 WHERE id = 'original'").run();
  assert.equal((await invoke(handleImport, db, { rows: values, previewToken: preview.data.previewToken, confirmed: true })).code, 409);
  assert.equal(db.receipts().length, 1);
  assert.equal(db.receipts()[0].amount, 120);
  assert.equal((await invoke(handleImport, db, { rows: [row(), row()] })).code, 400);
  assert.equal(db.receipts().length, 1);
});

test('D1快照读取后并发新增触发批次guard拒绝，保存并发记录', async (t) => {
  const db = await setup(t);
  const values = [row()];
  const preview = await invoke(handleImport, db, { rows: values, preview: true });
  db.beforeBatch = () => insert(db, { ...existing(row('2026-09-22', 300, 'cash')), id: 'concurrent' });
  const result = await invoke(handleImport, db, { rows: values, previewToken: preview.data.previewToken });
  assert.equal(result.code, 409);
  assert.equal(db.receipts().length, 1);
  assert.equal(db.receipts()[0].id, 'concurrent');
});

test('D1批次中途失败回滚删除和已写行，不留下部分导入', async (t) => {
  const db = await setup(t);
  insert(db, existing());
  const values = [row(undefined, 150), row('2026-09-21', 20)];
  const preview = await invoke(handleImport, db, { rows: values, preview: true });
  const before = db.receipts();
  db.failAt = 3;
  const result = await invoke(handleImport, db, { rows: values, previewToken: preview.data.previewToken, confirmed: true });
  assert.equal(result.code, 500);
  assert.deepEqual(db.receipts(), before);
});

test('同日同渠道累计只接受明确确认和最新快照，金额按分累计', async (t) => {
  const db = await setup(t);
  insert(db, existing(row(undefined, 0.1)));
  const before = db.receipts()[0];
  const payload = { ...row(undefined, 0.2), entryMode: 'manual' };
  assert.equal((await invoke(handleCreate, db, payload)).code, 409);
  assert.equal(db.receipts()[0].amount, 0.1);
  const confirmation = { appendToExisting: true, existingId: before.id, expectedUpdatedAt: before.updatedAt };
  const saved = await invoke(handleCreate, db, { ...payload, ...confirmation });
  assert.equal(saved.code, 0);
  assert.equal(saved.data.amount, 0.3);
  assert.equal(saved.data.people, 4);
  assert.equal(db.receipts().length, 1);
  assert.equal((await invoke(handleCreate, db, { ...payload, ...confirmation })).code, 409);
  assert.equal(db.receipts()[0].amount, 0.3);
  assert.equal(appendToReceipt(existing(), row(), { ...confirmation, existingId: 'wrong' }).error, '原记录已变化，请重新核对后确认累计');
});

test('D1同批月汇总与日明细拒绝，不因行顺序改变结果', async (t) => {
  const db = await setup(t);
  for (const values of [[{ ...row('2026-09'), granularity: 'month' }, row()], [row(), { ...row('2026-09'), granularity: 'month' }]]) {
    const preview = await invoke(handleImport, db, { rows: values, preview: true });
    assert.equal(preview.data.blocked, true);
    const saved = await invoke(handleImport, db, { rows: values, previewToken: preview.data.previewToken, confirmed: true });
    assert.equal(saved.code, 409);
    assert.equal(db.receipts().length, 0);
  }
});

test('已确认累计的原记录被删除后返回409，不悄悄创建新记录', async (t) => {
  const db = await setup(t);
  const result = await invoke(handleCreate, db, { ...row(), appendToExisting: true, existingId: 'deleted', expectedUpdatedAt: '2026-09-20T01:00:00.000Z' });
  assert.equal(result.code, 409);
  assert.equal(db.receipts().length, 0);
});

test('历史月汇总已有同月日明细时，明确累计月金额仍拒绝且原金额不变', async (t) => {
  const db = await setup(t);
  const monthly = { ...existing({ ...row('2026-09', 500), granularity: 'month' }), id: 'monthly' };
  insert(db, monthly);
  assert.equal((await invoke(handleCreate, db, row('2026-09-20', 100))).code, 0);
  const result = await invoke(handleCreate, db, { ...row('2026-09', 25), granularity: 'month', appendToExisting: true, existingId: monthly.id, expectedUpdatedAt: monthly.updatedAt });
  assert.equal(result.code, 409);
  assert.equal(db.receipts().find((item) => item.id === monthly.id).amount, 500);
  assert.equal(db.receipts().length, 2);
});
