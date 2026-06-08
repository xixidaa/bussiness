import { handleTrend } from '../../../_shared/receipts.js';

export async function onRequestGet(context) {
  return handleTrend(context.env.DB, context.request);
}
