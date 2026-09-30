// 导入核对按原始日期/周期和渠道计算；月汇总与日明细不相加。
export function receiptKey(row) {
  return `${row.granularity}__${row.channel}__${row.period}`;
}

function content(row) {
  return [row.granularity, row.channel, row.period, Number(row.amount), Number(row.people), row.remark || '', row.attachmentStatus || 'none'];
}

function cents(amount) {
  return Math.round(Number(amount) * 100);
}

export function buildImportPlan(values, receipts) {
  const existing = new Map(receipts.map((row) => [receiptKey(row), row]));
  const keyCounts = new Map();
  for (const row of values) keyCounts.set(receiptKey(row), (keyCounts.get(receiptKey(row)) || 0) + 1);
  const rows = values.map((row, index) => {
    const previous = existing.get(receiptKey(row));
    const same = previous && JSON.stringify(content(previous)) === JSON.stringify(content(row));
    const overlappingDays = row.granularity === 'month' && [...receipts, ...values].some((item) => item.granularity === 'day' && item.channel === row.channel && item.period.slice(0, 7) === row.period);
    const monthlyReference = row.granularity === 'day' && receipts.find((item) => item.granularity === 'month' && item.channel === row.channel && item.period === row.period.slice(0, 7));
    const status = keyCounts.get(receiptKey(row)) > 1 ? 'fileDuplicate' : overlappingDays ? 'blocked' : same ? 'duplicate' : previous ? 'conflict' : 'new';
    return {
      index,
      key: receiptKey(row),
      granularity: row.granularity,
      period: row.period,
      channel: row.channel,
      status,
      existingId: previous ? previous.id : null,
      existingAmount: previous ? Number(previous.amount) : 0,
      incomingAmount: Number(row.amount),
      difference: (cents(row.amount) - (previous ? cents(previous.amount) : 0)) / 100,
      existingPeople: previous ? Number(previous.people) : 0,
      incomingPeople: Number(row.people),
      monthlyReference: monthlyReference ? { period: monthlyReference.period, amount: Number(monthlyReference.amount) } : null,
      message: status === 'fileDuplicate' ? '文件内同周期同渠道重复，请先修正文件' : status === 'blocked' ? '该月已有或同时导入日明细，不能再导入月汇总' : status === 'duplicate' ? '与现有记录完全相同，将跳过' : status === 'conflict' ? '同日期/周期同渠道已存在，需确认替换' : monthlyReference ? '导入后该渠道月统计将采用日明细汇总，请核对月汇总' : '新增记录'
    };
  });
  const counts = Object.fromEntries(['new', 'conflict', 'duplicate', 'blocked', 'fileDuplicate'].map((status) => [status, rows.filter((row) => row.status === status).length]));
  return {
    rows,
    counts,
    existingAmount: rows.reduce((sum, row) => sum + cents(row.existingAmount), 0) / 100,
    incomingAmount: rows.reduce((sum, row) => sum + cents(row.incomingAmount), 0) / 100,
    difference: rows.reduce((sum, row) => sum + (row.status === 'duplicate' ? 0 : cents(row.difference)), 0) / 100,
    needsConfirmation: counts.conflict > 0 || rows.some((row) => row.monthlyReference),
    blocked: counts.blocked > 0 || counts.fileDuplicate > 0
  };
}

export async function importPreviewToken(userId, values, receipts) {
  const snapshot = receipts.map((row) => [row.id, ...content(row), row.createdAt, row.updatedAt]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const bytes = new TextEncoder().encode(JSON.stringify([userId, values.map(content), snapshot]));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function applyImportPlan(values, receipts, plan, userId, makeId, now) {
  const next = receipts.map((row) => ({ ...row }));
  for (const row of plan.rows) {
    if (row.status === 'duplicate') continue;
    const value = values[row.index];
    if (row.status === 'new') next.push({ id: makeId(), userId, ...value, createdAt: now, updatedAt: now });
    if (row.status === 'conflict') {
      const index = next.findIndex((item) => item.id === row.existingId);
      next[index] = { ...next[index], ...value, updatedAt: now };
    }
  }
  return next;
}

// 同日期、同渠道继续录入时，只有确认过原记录快照才能累加。
export function appendToReceipt(existing, value, confirmation, now = new Date().toISOString()) {
  if (confirmation.appendToExisting !== true) return { error: '相同渠道与周期的数据已存在，请确认累计或直接编辑' };
  if (confirmation.existingId !== existing.id || confirmation.expectedUpdatedAt !== existing.updatedAt) return { error: '原记录已变化，请重新核对后确认累计' };
  const remark = [existing.remark, value.remark && value.remark !== existing.remark ? value.remark : ''].filter(Boolean).join('；').slice(0, 200);
  const updatedAt = new Date(Math.max(new Date(now).getTime(), new Date(existing.updatedAt).getTime() + 1)).toISOString();
  return { value: {
    ...existing,
    amount: (cents(existing.amount) + cents(value.amount)) / 100,
    people: Number(existing.people) + Number(value.people),
    remark,
    attachmentStatus: value.attachmentStatus === 'none' ? existing.attachmentStatus : value.attachmentStatus,
    updatedAt
  } };
}
