import { ensureDatabase, handleCreate, handleList } from '../../_shared/receipts.js';

export async function onRequestGet(context) {
  await ensureDatabase(context.env.DB);
  return handleList(context.env.DB, context.request);
}

export async function onRequestPost(context) {
  await ensureDatabase(context.env.DB);
  return handleCreate(context.env.DB, context.request);
}
