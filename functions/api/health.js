import { handleHealth } from '../../_shared/receipts.js';

export async function onRequestGet() {
  return handleHealth();
}
