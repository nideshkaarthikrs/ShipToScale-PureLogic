require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');

const analyzeRouter = require('./src/controllers/analyzeController');
const compareRouter = require('./src/controllers/compareController');
const chatRouter = require('./src/controllers/chatController');

const app = express();
const PORT = process.env.PORT || 5001;

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'civiclens-backend' });
});

app.use('/api/analyze', analyzeRouter);
app.use('/api/compare', compareRouter);
app.use('/api/chat', chatRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'route not found' });
});

app.use((err, _req, res, _next) => {
  console.error('[civiclens] unhandled error:', err);
  res.status(500).json({ error: 'internal server error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`[civiclens] backend listening on http://localhost:${PORT}`);
});
