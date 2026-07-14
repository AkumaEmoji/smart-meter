import { FieldValue } from 'firebase-admin/firestore';

import { db } from './firebase.js';
import {
  hasValidBearerToken,
  IngestionValidationError,
  parseIngestionBody,
  parseIngestionMetadata,
} from './ingestion.js';
import { API_SCHEMA_VERSION, configuredMeterId } from './readings.js';

const ingestToken = process.env.SMART_METER_INGEST_TOKEN?.trim() ?? '';
const meterId = configuredMeterId();

let cachedReadings = null;
let lastFetchTime = 0;
const CACHE_DURATION_MS = 60 * 1000;

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const now = Date.now();

      if (cachedReadings && now - lastFetchTime < CACHE_DURATION_MS) {
        return res.status(200).json(cachedReadings);
      }

      const snapshot = await db.collection('readings')
        .orderBy('timestamp', 'desc')
        .limit(1000)
        .get();

      const results = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      cachedReadings = results;
      lastFetchTime = now;

      return res.status(200).json(results);
    }

    if (req.method === 'POST') {
      if (!ingestToken) {
        return res.status(503).json({ error: 'Meter ingestion is not configured' });
      }

      if (!hasValidBearerToken(req.headers, ingestToken)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      let reading;
      let metadata;
      try {
        reading = parseIngestionBody(req.body);
        metadata = parseIngestionMetadata(req.body, { meterId, source: 'api' });
      } catch (error) {
        if (error instanceof IngestionValidationError) {
          return res.status(400).json({ error: error.message });
        }
        throw error;
      }

      const timestamp = FieldValue.serverTimestamp();
      await db.collection('readings').add({
        ...reading,
        schemaVersion: API_SCHEMA_VERSION,
        ...metadata,
        timestamp,
        receivedAt: timestamp,
      });

      cachedReadings = null;

      return res.status(200).json({
        status: 'success',
        schemaVersion: API_SCHEMA_VERSION,
        ...metadata,
        ...reading,
      });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Smart Meter API error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
