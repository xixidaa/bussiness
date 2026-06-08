import {
  ensureDatabase,
  handleCreate,
  handleList,
  requireDatabase,
  withErrorHandling
} from '../../_shared/receipts.js';

export async function onRequestGet(context) {
  return withErrorHandling(async () => {
    const db = requireDatabase(context.env);
    if (db instanceof Response) return db;
    await ensureDatabase(db);
    return handleList(db, context.request);
  });
}

export async function onRequestPost(context) {
  return withErrorHandling(async () => {
    const db = requireDatabase(context.env);
    if (db instanceof Response) return db;
    await ensureDatabase(db);
    return handleCreate(db, context.request);
  });
}
