import express from 'express';
import cors from 'cors';
import receiptRoutes from './routes/receipts.js';
import userRoutes from './routes/users.js';
import { ensureDataFile } from './storage.js';

const app = express();
const PORT = process.env.PORT || 3001;

await ensureDataFile();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ code: 0, message: 'ok', data: { status: 'running' } });
});

app.use('/api/receipts', receiptRoutes);
app.use('/api/users', userRoutes);

app.use((req, res) => {
  res.status(404).json({ code: 404, message: '接口不存在', data: null });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
});

app.listen(PORT, () => {
  console.log(`Receipt statistics API is running at http://localhost:${PORT}`);
});
