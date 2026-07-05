import {
  ensureDatabase,
  handleUsersLogin,
  requireDatabase,
  withErrorHandling
} from '../../_shared/receipts.js';

export async function onRequestPost(context) {
  return withErrorHandling(async () => {
    const db = requireDatabase(context.env);
    if (db instanceof Response) return db;
    await ensureDatabase(db);
    return handleUsersLogin(db, context.request);
  });
}
