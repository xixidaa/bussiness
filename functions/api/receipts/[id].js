import { ensureDatabase, handleDelete, handleUpdate } from '../../_shared/receipts.js';

export async function onRequestPut(context) {
  await ensureDatabase(context.env.DB);
  return handleUpdate(context.env.DB, context.request, context.params.id);
}

export async function onRequestDelete(context) {
  await ensureDatabase(context.env.DB);
  return handleDelete(context.env.DB, context.params.id);
}
