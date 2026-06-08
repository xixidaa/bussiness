import { handleHealth, withErrorHandling } from '../_shared/receipts.js';

export async function onRequestGet() {
  return withErrorHandling(() => handleHealth());
}
