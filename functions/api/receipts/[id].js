import { handleDelete, handleUpdate } from '../../../_shared/receipts.js';

export async function onRequestPut(context) {
  return handleUpdate(context.env.DB, context.request, context.params.id);
}

export async function onRequestDelete(context) {
  return handleDelete(context.env.DB, context.params.id);
}
