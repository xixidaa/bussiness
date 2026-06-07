import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27027/merchant_receipt_statistics';

async function main() {
  await mongoose.connect(MONGODB_URI);

  const collection = mongoose.connection.db.collection('receipts');

  const before = await collection.countDocuments();
  const yearDeleteResult = await collection.deleteMany({ granularity: 'year' });

  const docs = await collection.find({}, { projection: { _id: 0 } }).toArray();
  const duplicateMonthKeys = new Map();

  for (const item of docs) {
    if (item.granularity !== 'month') continue;
    const key = `${item.channel}__${item.period}`;
    if (!duplicateMonthKeys.has(key)) duplicateMonthKeys.set(key, []);
    duplicateMonthKeys.get(key).push(item);
  }

  const duplicateMonthIds = [];
  for (const items of duplicateMonthKeys.values()) {
    if (items.length <= 1) continue;
    const sorted = [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    duplicateMonthIds.push(...sorted.slice(1).map((item) => item.id));
  }

  let duplicateDeleteCount = 0;
  if (duplicateMonthIds.length > 0) {
    const duplicateDeleteResult = await collection.deleteMany({ id: { $in: duplicateMonthIds } });
    duplicateDeleteCount = duplicateDeleteResult.deletedCount || 0;
  }

  const after = await collection.countDocuments();

  console.log(
    JSON.stringify(
      {
        uri: MONGODB_URI,
        before,
        removedYearRecords: yearDeleteResult.deletedCount || 0,
        removedDuplicateMonthRecords: duplicateDeleteCount,
        after
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
