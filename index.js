import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dataHandler from './api/data.js';
import capabilitiesHandler from './api/v1/capabilities.js';
import historyHandler from './api/v1/readings/index.js';
import latestHandler from './api/v1/readings/latest.js';

// These two lines are REQUIRED for ES Modules (type: module)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json({ limit: '64kb' }));

// Link the local and Vercel-compatible API handler.
app.all('/api/data', dataHandler);
app.all('/api/v1/readings/latest', latestHandler);
app.all('/api/v1/readings', historyHandler);
app.all('/api/v1/capabilities', capabilitiesHandler);

// Tell Express to serve the dashboard assets after API routes. This prevents
// the physical api/v1/readings directory from causing a trailing-slash redirect.
app.use(express.static(__dirname));

// Fallback: If someone visits "/", send the index.html file.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === __filename;

if (isDirectRun) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`Smart Meter server listening on http://localhost:${port}`);
  });
}

export default app;
