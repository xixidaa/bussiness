const SELECTION_KEY = 'merchant-receipt-entry-selection-v3';
const DRAFT_KEY = 'merchant-receipt-draft-v3';
const CHANNELS = ['wechat', 'alipay', 'cash', 'other'];

export function emptyEntry(selection) {
  return { granularity: selection.granularity, channel: selection.channel, period: selection.period,
    amount: null, people: null, remark: '', attachmentStatus: 'none' };
}

// 提交快照与表单使用相同字段，网络请求期间不再读取可变表单。
export function receiptPayload(form) {
  return { channel: form.channel, granularity: form.granularity, period: form.period,
    amount: Number(form.amount), people: Number(form.people), remark: form.remark.trim(),
    attachmentStatus: form.attachmentStatus, entryMode: 'manual' };
}

export function createEntrySession({ storage, userId, defaults, legacyDraft = null }) {
  const selectionKey = `${SELECTION_KEY}:${userId}`;
  const draftKey = `${DRAFT_KEY}:${userId}`;
  function read(key) {
    const value = storage.getItem(key);
    if (value === null) return null;
    try { return JSON.parse(value); }
    catch (error) { console.error('读取录入选择或草稿失败', key, error); return null; }
  }
  function validSelection(value) {
    if (!value || !['day', 'month'].includes(value.granularity) || !CHANNELS.includes(value.channel)) return false;
    if (value.period === null || value.period === '') return true;
    if (typeof value.period !== 'string') return false;
    const pattern = value.granularity === 'day' ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}$/;
    if (!pattern.test(value.period)) return false;
    const date = new Date(`${value.granularity === 'month' ? `${value.period}-01` : value.period}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, value.period.length) === value.period;
  }
  let selection = userId ? read(selectionKey) : null;
  if (!validSelection(selection)) selection = { ...defaults };
  let periods = { day: null, month: null, ...selection.periods, [selection.granularity]: selection.period };

  function remember(form) {
    if (!validSelection(form)) return;
    periods[form.granularity] = form.period;
    selection = { granularity: form.granularity, channel: form.channel, period: form.period, periods: { ...periods } };
    if (userId) storage.setItem(selectionKey, JSON.stringify(selection));
  }
  function clearDraft() { if (userId) storage.removeItem(draftKey); }
  function saveDraft(form) {
    remember(form);
    if (!userId) return false;
    const hasContent = form.amount !== null || form.people !== null || form.remark !== '' || form.attachmentStatus !== 'none';
    if (!hasContent) { clearDraft(); return false; }
    storage.setItem(draftKey, JSON.stringify({ ...emptyEntry(form), amount: form.amount, people: form.people,
      remark: form.remark, attachmentStatus: form.attachmentStatus }));
    return true;
  }
  function restore() {
    const draft = userId ? read(draftKey) : null;
    if (validSelection(draft) && typeof draft.remark === 'string' && ['none', 'uploaded', 'pending'].includes(draft.attachmentStatus)) {
      remember(draft);
      return { form: { ...emptyEntry(draft), amount: draft.amount, people: draft.people,
        remark: draft.remark, attachmentStatus: draft.attachmentStatus }, restored: true };
    }
    return { form: emptyEntry(selection), restored: false };
  }
  function saved(payload) {
    remember(payload);
    clearDraft();
    return emptyEntry(selection);
  }
  function clear() {
    clearDraft();
    periods = { day: null, month: null };
    remember(defaults);
    return emptyEntry(selection);
  }
  function changeGranularity(next, period) {
    if (!period) return period;
    if (next === 'month') return period.slice(0, 7);
    if (period.length === 10) return period;
    const remembered = periods.day;
    return remembered && remembered.startsWith(period) ? remembered : `${period}-01`;
  }
  // 旧草稿仅由原来登录的用户迁移；无归属的草稿不自动套给其他账号。
  if (userId && legacyDraft && !read(draftKey) && validSelection(legacyDraft)) saveDraft(legacyDraft);
  return { restore, remember, saveDraft, clearDraft, saved, clear, changeGranularity };
}
