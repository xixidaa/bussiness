import { handleCreate, handleList } from '../../../_shared/receipts.js';

export async function onRequestGet(context) {
  return handleList(context.env.DB, context.request);
}

export async function onRequestPost(context) {
  return handleCreate(context.env.DB, context.request);
}
