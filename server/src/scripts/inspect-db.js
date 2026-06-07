import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27027/merchant_receipt_statistics';

async function main() {
  await mongoose.connect(MONGODB_URI);

  const collection = mongoose.connection.db.collection('receipts');
  const docs = await collection.find({}, { projection: { _id: 0 } }).sort({ granularity: 1, period: 1, channel: 1 }).toArray();

  const summary = docs.reduce(
    (acc, item) => {
      acc.total += 1;
      acc.byGranularity[item.granularity] = (acc.byGranularity[item.granularity] || 0) + 1;
      acc.byChannel[item.channel] = (acc.byChannel[item.channel] || 0) + 1;
      return acc;
    },
    {
      total: 0,
      byGranularity: {},
      byChannel: {}
    }
  );

  const recent = docs.slice(-10).reverse();

  console.log(
    JSON.stringify(
      {
        uri: MONGODB_URI,
        summary,
        recent
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
