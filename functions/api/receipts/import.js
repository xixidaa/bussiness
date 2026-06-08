import { ensureDatabase, handleImport } from '../../_shared/receipts.js';

export async function onRequestPost(context) {
  await ensureDatabase(context.env.DB);
  return handleImport(context.env.DB, context.request);
}
