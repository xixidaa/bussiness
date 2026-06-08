import { handleImport } from '../../../_shared/receipts.js';

export async function onRequestPost(context) {
  return handleImport(context.env.DB, context.request);
}
