import {
  ensureDatabase,
  handleDelete,
  handleUpdate,
  requireDatabase,
  withErrorHandling
} from '../../_shared/receipts.js';

export async function onRequestPut(context) {
  return withErrorHandling(async () => {
    const db = requireDatabase(context.env);
    if (db instanceof Response) return db;
    await ensureDatabase(db);
    return handleUpdate(db, context.request, context.params.id);
  });
}

export async function onRequestDelete(context) {
  return withErrorHandling(async () => {
    const db = requireDatabase(context.env);
    if (db instanceof Response) return db;
    await ensureDatabase(db);
    return handleDelete(db, context.params.id);
  });
}
