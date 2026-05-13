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
      const snapshot = await db.collection('readings').orderBy('timestamp', 'desc').limit(50).get();
      
      if (snapshot.empty) {
        return res.status(200).json([]);
      }

      const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json(results);
    }

    if (req.method === 'POST') {
      const body = req.body;
      console.log("POST body:", JSON.stringify(body));

      let active_power_w   = 0;
      let total_import_kwh = 0;
      let total_export_kwh = 0;

      // Format A: meter sends raw SML/OBIS object directly
      if (body["1-0:16.7.0*255"] || body["1-0:1.8.0*255"]) {
        active_power_w   = body["1-0:16.7.0*255"]?.values?.[0]?.value ?? 0;
        total_import_kwh = body["1-0:1.8.0*255"]?.values?.[0]?.value  ?? 0;
        total_export_kwh = body["1-0:2.8.0*255"]?.values?.[0]?.value  ?? 0;
      }
      // Format B: already parsed { power, importKwh, exportKwh }
      else if (body.power !== undefined) {
        active_power_w   = body.power     || 0;
        total_import_kwh = body.importKwh || 0;
        total_export_kwh = body.exportKwh || 0;
      }
      // Format C: raw_data is a JSON string inside the body
      else if (body.raw_data) {
        const parsed     = typeof body.raw_data === 'string' ? JSON.parse(body.raw_data) : body.raw_data;
        active_power_w   = parsed["1-0:16.7.0*255"]?.values?.[0]?.value ?? 0;
        total_import_kwh = parsed["1-0:1.8.0*255"]?.values?.[0]?.value  ?? 0;
        total_export_kwh = parsed["1-0:2.8.0*255"]?.values?.[0]?.value  ?? 0;
      }

      console.log("Parsed values →", { active_power_w, total_import_kwh, total_export_kwh });

      await db.collection('readings').add({
        active_power_w,
        total_import_kwh,
        total_export_kwh,
        raw_data: JSON.stringify(body),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).json({ status: 'success', active_power_w, total_import_kwh, total_export_kwh });
    }

    // Method not allowed
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error("Firebase Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}