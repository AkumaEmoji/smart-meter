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

export default async function handler(req, res) {
  console.log("Function triggered with method:", req.method);

  try {
    if (req.method === 'GET') {
      const snapshot = await db.collection('readings').orderBy('timestamp', 'desc').limit(1000).get();
      
      if (snapshot.empty) {
        return res.status(200).json([]);
      }

      const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json(results);
    }

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
          //raw_data: JSON.stringify(body),
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).json({ status: 'success', power, importKwh, exportKwh });
    }

    // Method not allowed
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error("Firebase Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}