import express from 'express';
import { nanoid } from 'nanoid';
import { createUser, readUsers } from '../storage.js';

const router = express.Router();

const ok = (res, data = null, message = 'success') => res.json({ code: 0, message, data });
const fail = (res, status, message) => res.status(status).json({ code: status, message, data: null });

function normalizeUserId(value) {
  const text = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{2,32}$/.test(text) ? text : '';
}

function normalizeUserName(value) {
  return String(value || '').trim().slice(0, 24);
}

router.get('/', async (req, res, next) => {
  try {
    ok(res, await readUsers());
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const name = normalizeUserName(req.body?.name);
    const id = normalizeUserId(req.body?.id) || `user-${nanoid(8).toLowerCase()}`;

    if (!name) return fail(res, 400, '用户名称不能为空');

    const users = await readUsers();
    if (users.some((item) => item.id === id)) return fail(res, 409, '用户已存在');

    const now = new Date().toISOString();
    const user = {
      id,
      name,
      role: 'user',
      createdAt: now,
      updatedAt: now
    };

    ok(res, await createUser(user), '新增成功');
  } catch (error) {
    next(error);
  }
});

export default router;
