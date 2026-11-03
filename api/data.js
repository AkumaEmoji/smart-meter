import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

// --- IN-MEMORY CACHE STORAGE ---
// These variables live outside the handler function so they persist between requests
let cachedReadings = null;
let lastFetchTime = 0;
const CACHE_DURATION_MS = 60 * 1000; // Cache duration: 1 minute (60,000 ms)
// -------------------------------

export default async function handler(req, res) {
  console.log("Function triggered with method:", req.method);

  try {
    // === GET METHOD (Readings) ===
    if (req.method === 'GET') {
      const now = Date.now();

      // 1. Check if valid, unexpired data exists in the memory cache
      if (cachedReadings && (now - lastFetchTime < CACHE_DURATION_MS)) {
        console.log("Serving 1000 readings from memory cache (0 Firestore Reads!)");
        return res.status(200).json(cachedReadings);
      }

      console.log("Cache miss or expired. Fetching 1000 readings from Firestore...");
      const snapshot = await db.collection('readings').orderBy('timestamp', 'desc').limit(1000).get();
      
      if (snapshot.empty) {
        return res.status(200).json([]);
      }

      const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // 2. Save the results to memory and stamp the time
      cachedReadings = results;
      lastFetchTime = now;

      return res.status(200).json(results);
    }

    // === POST METHOD (Smart Meter Ingestion) ===
    if (req.method === 'POST') {
      const body = req.body;
      console.log("POST body:", JSON.stringify(body));

      let power      = 0;
      let importKwh  = 0;
      let exportKwh  = 0;

      // Format A: meter sends raw SML/OBIS object directly
      if (body["1-0:16.7.0*255"] || body["1-0:1.8.0*255"]) {
          power     = body["1-0:16.7.0*255"]?.values?.[0]?.value ?? 0;
          importKwh = body["1-0:1.8.0*255"]?.values?.[0]?.value  ?? 0;
          exportKwh = body["1-0:2.8.0*255"]?.values?.[0]?.value  ?? 0;
      }
      // Format B: already parsed { power, importKwh, exportKwh }
      else if (body.power !== undefined) {
          power     = body.power     || 0;
          importKwh = body.importKwh || 0;
          exportKwh = body.exportKwh || 0;
      }
      // Format C: raw_data is a JSON string or object inside the body
      else if (body.raw_data) {
          const parsed = typeof body.raw_data === 'string' ? JSON.parse(body.raw_data) : body.raw_data;
          
          // Check if the parsed raw_data uses the flat string format from your previous script
          if (typeof parsed["1-0:16.7.0*255"] === 'string') {
              power     = parseFloat(parsed["1-0:16.7.0*255"]) || 0;
              importKwh = parseFloat(parsed["1-0:1.8.0*255"]) || 0;
              exportKwh = parseFloat(parsed["1-0:2.8.0*255"]) || 0;
          } else {
              // Fallback to complex nested structure if Format A is inside raw_data
              power     = parsed["1-0:16.7.0*255"]?.values?.[0]?.value ?? 0;
              importKwh = parsed["1-0:1.8.0*255"]?.values?.[0]?.value  ?? 0;
              exportKwh = parsed["1-0:2.8.0*255"]?.values?.[0]?.value  ?? 0;
          }
      }

      await db.collection('readings').add({
          power,
          importKwh,
          exportKwh,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 3. Clear the cache when new data arrives
      // This forces the next GET request to fetch the brand new entry immediately.
      cachedReadings = null;

      return res.status(200).json({ status: 'success', power, importKwh, exportKwh });
    }

    // Method not allowed
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error("Firebase Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
