import { handleSummary } from '../../../_shared/receipts.js';

export async function onRequestGet(context) {
  return handleSummary(context.env.DB, context.request);
}
