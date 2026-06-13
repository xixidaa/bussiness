import {
  ensureDatabase,
  handleUsersCreate,
  handleUsersList,
  requireDatabase,
  withErrorHandling
} from '../../_shared/receipts.js';

export async function onRequestGet(context) {
  return withErrorHandling(async () => {
    const db = requireDatabase(context.env);
    if (db instanceof Response) return db;
    await ensureDatabase(db);
    return handleUsersList(db);
  });
}

export async function onRequestPost(context) {
  return withErrorHandling(async () => {
    const db = requireDatabase(context.env);
    if (db instanceof Response) return db;
    await ensureDatabase(db);
    return handleUsersCreate(db, context.request);
  });
}
