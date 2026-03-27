const admin = require('firebase-admin');

// Initialize Firebase only once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // This replaces the newline characters that often break in env variables
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { power, importKwh, exportKwh, raw_data } = req.body;
      
      await db.collection('readings').add({
        active_power_w: power,
        total_import_kwh: importKwh,
        total_export_kwh: exportKwh,
        raw_data: JSON.stringify(raw_data),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).json({ status: 'success' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  
  // For your index.html to show the data
if (req.method === 'GET') {
    try {
      const snapshot = await db.collection('readings').orderBy('timestamp', 'desc').limit(50).get();
      
      // If the database is empty, return an empty list instead of crashing
      if (snapshot.empty) {
        return res.status(200).json([]);
      }

      const results = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      return res.status(200).json(results);
    } catch (error) {
      console.error("Firebase Read Error:", error.message);
      return res.status(500).json({ error: "Check Firebase Permissions or Environment Variables" });
    }
  }
}