import { ensureDatabase, handleSingle } from '../../_shared/receipts.js';

export async function onRequestGet(context) {
  await ensureDatabase(context.env.DB);
  return handleSingle(context.env.DB, context.request);
}
