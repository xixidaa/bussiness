import { handleSingle } from '../../../_shared/receipts.js';

export async function onRequestGet(context) {
  return handleSingle(context.env.DB, context.request);
}
