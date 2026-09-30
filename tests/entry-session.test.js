import test from 'node:test';
import assert from 'node:assert/strict';
import { createEntrySession, receiptPayload } from '../client/src/utils/entry-session.js';

function fixture() {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const defaults = { granularity: 'day', channel: 'wechat', period: '2026-09-30' };
  const session = (userId = 'user-a', legacyDraft = null) => createEntrySession({ storage, userId, defaults, legacyDraft });
  return { session, defaults };
}

test('日度保存并继续使用当前日期和支付宝，清空金额人数而保留选择', () => {
  const { session } = fixture();
  const state = session();
  const form = { ...state.restore().form, channel: 'alipay', period: '2026-04-12', amount: 120.35, people: 3 };
  state.saveDraft(form);
  const payload = receiptPayload(form);
  const next = state.saved(payload);
  assert.equal(payload.period, '2026-04-12');
  assert.equal(payload.channel, 'alipay');
  assert.deepEqual([next.period, next.channel, next.amount, next.people], ['2026-04-12', 'alipay', null, null]);
  assert.equal(state.restore().restored, false);
});

test('月度普通保存后重新新建及刷新均沿用周期与现金渠道', () => {
  const { session } = fixture();
  const state = session();
  state.saved({ ...state.restore().form, granularity: 'month', period: '2026-02', channel: 'cash', amount: 900, people: 9 });
  assert.deepEqual(session().restore().form, { granularity: 'month', period: '2026-02', channel: 'cash', amount: null, people: null, remark: '', attachmentStatus: 'none' });
});

test('草稿恢复保留日期、渠道及尚未保存的金额，提交快照不被后续编辑影响', () => {
  const { session } = fixture();
  const form = { ...session().restore().form, period: '2025-11-09', channel: 'other', amount: 18.2, people: 1, remark: ' 补录 ' };
  session().saveDraft(form);
  const restored = session().restore();
  assert.equal(restored.restored, true);
  assert.equal(restored.form.period, form.period);
  const payload = receiptPayload(restored.form);
  restored.form.period = '2026-09-30';
  restored.form.channel = 'wechat';
  assert.equal(payload.period, '2025-11-09');
  assert.equal(payload.channel, 'other');
  assert.equal(payload.remark, '补录');
});

test('用户选择与草稿隔离，编辑其他记录不覆盖新建草稿', () => {
  const { session, defaults } = fixture();
  const form = { ...session().restore().form, channel: 'cash', period: '2026-03-20', amount: 100 };
  session().saveDraft(form);
  const editingPayload = receiptPayload({ ...form, channel: 'alipay', period: '2026-04-01' });
  assert.equal(editingPayload.channel, 'alipay');
  assert.equal(session().restore().form.channel, 'cash');
  assert.equal(session('user-b').restore().form.period, defaults.period);
  assert.equal(session('user-b').restore().restored, false);
});

test('用户主动清除日期保持为空；明确清空表单才重置默认选择', () => {
  const { session, defaults } = fixture();
  const state = session();
  state.remember({ granularity: 'day', channel: 'cash', period: null });
  assert.equal(session().restore().form.period, null);
  assert.equal(session().restore().form.channel, 'cash');
  assert.equal(state.clear().period, defaults.period);
  assert.equal(session().restore().form.channel, defaults.channel);
});

test('日/月切换沿用当前历史月份，切回日度恢复该月选择', () => {
  const { session } = fixture();
  const state = session();
  state.remember({ granularity: 'day', channel: 'alipay', period: '2026-04-18' });
  assert.equal(state.changeGranularity('month', '2026-04-18'), '2026-04');
  assert.equal(state.changeGranularity('day', '2026-04'), '2026-04-18');
  assert.equal(state.changeGranularity('day', '2026-05'), '2026-05-01');
  assert.equal(state.changeGranularity('day', null), null);
});

test('带归属的旧草稿迁移只写入原用户', () => {
  const { session } = fixture();
  const legacy = { ...session().restore().form, period: '2026-01-02', channel: 'cash', amount: 31, people: 1 };
  assert.equal(session('user-a', legacy).restore().form.period, '2026-01-02');
  assert.equal(session('user-b').restore().restored, false);
});
