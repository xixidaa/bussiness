import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { seedReceipts } from './seed-data.js';

export const DEFAULT_USER = {
  id: 'admin',
  name: '管理员',
  role: 'admin'
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_NAME = 'merchant_receipt_statistics';
const EMBEDDED_DB_PATH = path.resolve(__dirname, '../.mongo-data');

const receiptSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true, default: DEFAULT_USER.id, index: true },
    channel: { type: String, required: true, enum: ['wechat', 'alipay', 'cash'] },
    granularity: { type: String, required: true, enum: ['year', 'month', 'day'] },
    period: { type: String, required: true },
    date: { type: String, required: true },
    amount: { type: Number, required: true },
    people: { type: Number, required: true },
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
        port: 27027,
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
        createdAt: now
      },
      $set: {
        name: DEFAULT_USER.name,
        role: DEFAULT_USER.role,
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

  const total = await Receipt.countDocuments();
  if (total === 0) {
    await Receipt.insertMany(seedReceipts.map((item) => ({ userId: DEFAULT_USER.id, ...item })));
  }
  seeded = true;
}

export async function ensureDataFile() {
  if (mongoose.connection.readyState !== 1) {
    const mongoUri = await resolveMongoUri();
    await mongoose.connect(mongoUri);
  }
  await seedIfNeeded();
}

export async function readReceipts() {
  await ensureDataFile();
  const docs = await Receipt.find().lean();
  return docs.map(({ _id, ...rest }) => rest);
}

export async function writeReceipts(receipts) {
  await ensureDataFile();
  await Receipt.deleteMany({});
  if (receipts.length > 0) {
    await Receipt.insertMany(receipts.map((item) => ({ ...item, userId: item.userId || DEFAULT_USER.id })));
  }
}

export async function readUsers() {
  await ensureDataFile();
  const docs = await User.find().sort({ role: 1, createdAt: 1 }).lean();
  return docs.map(({ _id, ...rest }) => rest);
}

export async function createUser(user) {
  await ensureDataFile();
  await User.create(user);
  return user;
}
