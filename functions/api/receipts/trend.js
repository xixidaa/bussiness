import { ensureDatabase, handleTrend } from '../../_shared/receipts.js';

export async function onRequestGet(context) {
  await ensureDatabase(context.env.DB);
  return handleTrend(context.env.DB, context.request);
}
