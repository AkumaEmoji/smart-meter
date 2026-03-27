import admin from 'firebase-admin';

// Initialize Firebase only once
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // The regex below fixes the newline issue common in Vercel
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    console.log("Firebase Initialized Successfully");
  } catch (error) {
    console.error("Firebase Init Error:", error.stack);
  }
}

const db = admin.firestore();

export default async function handler(req, res) {
  // Handle POST: Saving data from Raspberry Pi
  if (req.method === 'POST') {
    try {
      const { power, importKwh, exportKwh, raw_data } = req.body;
      
      await db.collection('readings').add({
        active_power_w: power || 0,
        total_import_kwh: importKwh || 0,
        total_export_kwh: exportKwh || 0,
        raw_data: raw_data ? JSON.stringify(raw_data) : "{}",
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).json({ status: 'success' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  
  // Handle GET: Showing data on index.html
  if (req.method === 'GET') {
    try {
      const snapshot = await db.collection('readings')
        .orderBy('timestamp', 'desc')
        .limit(50)
        .get();
        
      const results = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Convert Firebase Timestamp to a readable string for the browser
        timestamp: doc.data().timestamp ? doc.data().timestamp.toDate() : new Date()
      }));

      return res.status(200).json(results);
    } catch (error) {
      console.error("GET Error:", error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}