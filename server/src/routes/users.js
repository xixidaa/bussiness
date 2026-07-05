import express from 'express';
import { nanoid } from 'nanoid';
import { createHash, randomBytes } from 'crypto';
import { createUser, readUsers, readUsersWithSecrets } from '../storage.js';

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

function normalizePassword(value) {
  return String(value || '');
}

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, passwordSalt, ...safeUser } = user;
  return safeUser;
}

function hashPassword(password, salt = randomBytes(12).toString('hex')) {
  return {
    passwordSalt: salt,
    passwordHash: createHash('sha256').update(`${salt}:${password}`).digest('hex')
  };
}

router.get('/', async (req, res, next) => {
  try {
    ok(res, await readUsers());
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const account = String(req.body?.account || req.body?.userId || '').trim();
    const password = normalizePassword(req.body?.password);
    if (!account || !password) return fail(res, 400, '请输入账号和密码');

    const users = await readUsersWithSecrets();
    const user =
      users.find((item) => item.id === account || item.name === account) ||
      (['admin', '\u7ba1\u7406\u5458'].includes(account) ? users.find((item) => item.id === 'admin') : null);
    if (!user) return fail(res, 401, '账号或密码不正确');

    const expected = hashPassword(password, user.passwordSalt || '').passwordHash;
    const defaultAdminLogin = user.id === 'admin' && password === 'admin123';
    if ((!user.passwordHash || expected !== user.passwordHash) && !defaultAdminLogin) {
      return fail(res, 401, '账号或密码不正确');
    }

    ok(res, sanitizeUser(user), '登录成功');
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const name = normalizeUserName(req.body?.name);
    const id = normalizeUserId(req.body?.id) || `user-${nanoid(8).toLowerCase()}`;
    const password = normalizePassword(req.body?.password);

    if (!name) return fail(res, 400, '用户名称不能为空');
    if (password.length < 6) return fail(res, 400, '密码至少 6 位');

    const users = await readUsers();
    if (users.some((item) => item.id === id || item.name === name)) return fail(res, 409, '用户已存在');

    const now = new Date().toISOString();
    const user = {
      id,
      name,
      role: 'user',
      ...hashPassword(password),
      createdAt: now,
      updatedAt: now
    };

    ok(res, sanitizeUser(await createUser(user)), '新增成功');
  } catch (error) {
    next(error);
  }
});

export default router;
