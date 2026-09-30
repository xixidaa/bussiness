import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';

export const DEFAULT_USER = {
  id: 'admin',
  name: '管理员',
  role: 'admin'
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_NAME = process.env.MONGODB_DB_NAME || 'merchant_receipt_statistics';
const EMBEDDED_DB_PATH = process.env.MONGODB_DATA_PATH ? path.resolve(process.env.MONGODB_DATA_PATH) : path.resolve(__dirname, '../.mongo-data');
const DEFAULT_PASSWORD_SALT = 'merchant-ledger-default-admin';
const DEFAULT_PASSWORD_HASH = createHash('sha256').update(`${DEFAULT_PASSWORD_SALT}:admin123`).digest('hex');

const receiptSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true, default: DEFAULT_USER.id, index: true },
    channel: { type: String, required: true, enum: ['wechat', 'alipay', 'cash', 'other'] },
    granularity: { type: String, required: true, enum: ['year', 'month', 'day'] },
    period: { type: String, required: true },
    date: { type: String, required: true },
    amount: { type: Number, required: true },
    people: { type: Number, required: true },
    entryMode: { type: String, required: true, default: 'manual', enum: ['manual', 'import'] },
    remark: { type: String, default: '' },
    attachmentStatus: { type: String, required: true, default: 'none', enum: ['none', 'uploaded', 'pending'] },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true }
  },
  {
    collection: 'receipts',
    versionKey: false
  }
);

receiptSchema.index({ userId: 1, channel: 1, granularity: 1, period: 1 }, { unique: true });

const userSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    role: { type: String, required: true, default: 'user' },
    passwordHash: { type: String, default: '' },
    passwordSalt: { type: String, default: '' },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true }
  },
  {
    collection: 'users',
    versionKey: false
  }
);

const Receipt = mongoose.models.Receipt || mongoose.model('Receipt', receiptSchema);
const User = mongoose.models.User || mongoose.model('User', userSchema);

let seeded = false;
let memoryServerPromise;

async function resolveMongoUri() {
  if (process.env.MONGODB_URI) {
    return process.env.MONGODB_URI;
  }

  if (!memoryServerPromise) {
    await fs.mkdir(EMBEDDED_DB_PATH, { recursive: true });
    memoryServerPromise = MongoMemoryServer.create({
      binary: {
        version: '7.0.14'
      },
      instance: {
        dbName: DB_NAME,
        dbPath: EMBEDDED_DB_PATH,
        port: Number(process.env.MONGODB_PORT || 27027),
        storageEngine: 'wiredTiger'
      }
    });
  }

  const memoryServer = await memoryServerPromise;
  return memoryServer.getUri(DB_NAME);
}

async function seedIfNeeded() {
  if (seeded) return;
  const now = new Date().toISOString();
  await User.updateOne(
    { id: DEFAULT_USER.id },
    {
      $setOnInsert: {
        id: DEFAULT_USER.id,
        createdAt: now,
        name: DEFAULT_USER.name,
        role: DEFAULT_USER.role,
        passwordHash: DEFAULT_PASSWORD_HASH,
        passwordSalt: DEFAULT_PASSWORD_SALT,
        updatedAt: now
      }
    },
    { upsert: true }
  );
  await Receipt.updateMany(
    {
      $or: [
        { userId: { $exists: false } },
        { userId: null },
        { userId: '' }
      ]
    },
    { $set: { userId: DEFAULT_USER.id } }
  );

  seeded = true;
}

export async function ensureDataFile() {
  if (mongoose.connection.readyState !== 1) {
    const mongoUri = await resolveMongoUri();
    await mongoose.connect(mongoUri);
  }
  await seedIfNeeded();
}

const receiptMutationContext = new AsyncLocalStorage();
let receiptMutationQueue = Promise.resolve();

export async function withReceiptMutation(task) {
  if (receiptMutationContext.getStore()) return task();
  const operation = receiptMutationQueue.then(() => receiptMutationContext.run(true, task));
  receiptMutationQueue = operation.catch(() => undefined);
  return operation;
}

export async function readReceipts() {
  if (!receiptMutationContext.getStore()) return withReceiptMutation(() => readReceipts());
  await ensureDataFile();
  const docs = await Receipt.find().lean();
  return docs.map(({ _id, ...rest }) => rest);
}

export async function writeReceipts(receipts) {
  if (!receiptMutationContext.getStore()) return withReceiptMutation(() => writeReceipts(receipts));
  await ensureDataFile();
  const next = receipts.map((item) => ({ ...item, userId: item.userId || DEFAULT_USER.id }));
  const ids = new Set();
  const keys = new Set();
  // 所有行先校验，任何一行失败都不写入。
  for (const item of next) {
    await new Receipt(item).validate();
    const key = `${item.userId}__${item.channel}__${item.granularity}__${item.period}`;
    if (ids.has(item.id) || keys.has(key)) throw new Error('批次存在重复记录，未写入');
    ids.add(item.id);
    keys.add(key);
  }
  const original = (await Receipt.find().lean()).map(({ _id, ...rest }) => rest);
  const before = new Map(original.map((item) => [item.id, item]));
  const after = new Map(next.map((item) => [item.id, item]));
  const stable = (item) => JSON.stringify(Object.keys(item).sort().map((key) => [key, item[key]]));
  const changed = next.filter((item) => !before.has(item.id) || stable(before.get(item.id)) !== stable(item));
  const removed = original.filter((item) => ['day', 'month'].includes(item.granularity) && !after.has(item.id));
  const operations = [
    ...removed.map((item) => ({ deleteOne: { filter: { id: item.id } } })),
    ...changed.map((item) => ({ replaceOne: { filter: { id: item.id }, replacement: item, upsert: true } }))
  ];
  if (operations.length === 0) return;
  try {
    await Receipt.bulkWrite(operations, { ordered: true });
  } catch (error) {
    // 单机 MongoDB 无多文档事务；普通写入失败恢复本批次，序列锁同时挡住读取。
    const addedIds = changed.filter((item) => !before.has(item.id)).map((item) => item.id);
    if (addedIds.length) await Receipt.deleteMany({ id: { $in: addedIds } });
    const restore = [...removed, ...changed.filter((item) => before.has(item.id)).map((item) => before.get(item.id))];
    if (restore.length) await Receipt.bulkWrite(restore.map((item) => ({ replaceOne: { filter: { id: item.id }, replacement: item, upsert: true } })), { ordered: true });
    throw error;
  }
}

export async function readUsers() {
  await ensureDataFile();
  const docs = await User.find().sort({ role: 1, createdAt: 1 }).lean();
  return docs.map(({ _id, passwordHash, passwordSalt, ...rest }) => rest);
}

export async function readUsersWithSecrets() {
  await ensureDataFile();
  const docs = await User.find().sort({ role: 1, createdAt: 1 }).lean();
  return docs.map(({ _id, ...rest }) => rest);
}

export async function createUser(user) {
  await ensureDataFile();
  await User.create(user);
  return user;
}

export async function closeStorage() {
  await mongoose.disconnect();
  if (memoryServerPromise) await (await memoryServerPromise).stop();
  memoryServerPromise = undefined;
  seeded = false;
}
