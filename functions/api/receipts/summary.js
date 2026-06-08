import {
  ensureDatabase,
  handleSummary,
  requireDatabase,
  withErrorHandling
} from '../../_shared/receipts.js';

export async function onRequestGet(context) {
  return withErrorHandling(async () => {
    const db = requireDatabase(context.env);
    if (db instanceof Response) return db;
    await ensureDatabase(db);
    return handleSummary(db, context.request);
  });
}
