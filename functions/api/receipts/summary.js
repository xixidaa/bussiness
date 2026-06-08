import { ensureDatabase, handleSummary } from '../../_shared/receipts.js';

export async function onRequestGet(context) {
  await ensureDatabase(context.env.DB);
  return handleSummary(context.env.DB, context.request);
}
