import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dataHandler from './api/data.js';

// These two lines are REQUIRED for ES Modules (type: module)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 1. Tell Express to serve your index.html automatically
app.use(express.static(__dirname));

// 2. Link my working API
app.all('/api/data', dataHandler);

// 3. Fallback: If someone visits "/", send the index.html file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

export default app;