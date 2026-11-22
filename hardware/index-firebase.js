var admin = require("firebase-admin");

const serviceAccount = require('./smart-meter-project-497ac-firebase-adminsdk-fbsvc-98a2a903d2.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const SmartmeterObis = require('smartmeter-obis');
const path = require('path');
const express = require('express');

// --- Obtain the Firebase database client ---
// When using Cloud Firestore:
const firestoreDb = admin.firestore();

// Comment out or remove this since we're not using Firebase Realtime Database.
// const rtdb = admin.database();

// --- Database setup (SQLite parts removed) ---
// const db = new Database('sensor_data.db');
// db.prepare(`...`).run();


const options = {
    protocol: "SmlProtocol",
    transport: "SerialResponseTransport",
    transportSerialPort: "/dev/tty.usbserial-130",
    transportSerialBaudrate: 9600,
    obisNameLanguage: 'en',
    obisFallbackMedium: 6
};

// --- API server setup (for the frontend) ---
const app = express();
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API endpoint for fetching data from Cloud Firestore
app.get('/api/data', async (req, res) => {
    try {
        // Fetch the 100 most recent documents from the 'meter_readings' collection
        const snapshot = await firestoreDb.collection('meter_readings')
                                          .orderBy('timestamp', 'desc') // Get the latest entries
                                          .limit(100)
                                          .get();
        // Format the retrieved documents and return them in the response
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(data);
    } catch (err) {
        console.error("API Error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => console.log("API Server: http://localhost:3000"));


// --- Data reception handling ---
// --- 1. Update reception handling to save to Cloud Firestore ---
async function displayAndSaveData(err, obisResult) {
    if (err) return console.error(err);

    const power = obisResult['1-0:16.7.0*255']?.value || 0;
    const importKwh = obisResult['1-0:1.8.0*255']?.value || 0;
    const exportKwh = obisResult['1-0:2.8.0*255']?.value || 0;

    console.log(`Saving to Cloud Firestore... 電力: ${power}W, 受電: ${importKwh}kWh`);
    try {
        await firestoreDb.collection('meter_readings').add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(), // Use Firestore's server timestamp
            power: power,
            total_import_kwh: importKwh,
            total_export_kwh: exportKwh,
            raw_data: JSON.stringify(obisResult)
        });
        console.log("Data successfully written to Cloud Firestore!");
    } catch (error) {
        console.error("Error writing document to Cloud Firestore: ", error);
    }

    // Wait for the next reading
    smTransport.process();
}

// --- 2. Kick off the first read ---
const smTransport = SmartmeterObis.init(options, displayAndSaveData);
console.log("Starting Smart Meter Reading (Press Ctrl+C to stop)...");

// Calling this once is enough instead of a while(1) loop
smTransport.process();
