const SmartmeterObis = require('smartmeter-obis');

// --- Firebase Admin setup ---
const admin = require('firebase-admin');
const serviceAccount = require('./smart-meter-project-497ac-firebase-adminsdk-fbsvc-98a2a903d2.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
// ----------------------------

const options = {
    protocol: "SmlProtocol",
    transport: "SerialResponseTransport",
    transportSerialPort: "/dev/tty.usbserial-1140",   // change if needed
    transportSerialBaudrate: 9600,
    obisNameLanguage: 'en',
    obisFallbackMedium: 6
};

// Helper function to safely extract OBIS values
const getValue = (obisResult, obisCode) => {
    for (const id in obisResult) {
        const entry = obisResult[id];
        if (entry.idToString() === obisCode) {
            const v = entry.getValue && entry.getValue();
            if (v && v.value !== undefined && v.value !== null) {
                return v.value;
            }
            const parsed = parseFloat(entry.valueToString());
            return isNaN(parsed) ? 0 : parsed;
        }
    }
    return 0;
};

// Callback function triggered automatically whenever new data is read from the meter
async function handleSensorData(err, obisResult) {
    if (err) {
        console.error("Sensor Error:", err);
        return;
    }

    console.log("----- New Telegram Received -----");
    
    // Display raw telegram entries in the console
    for (let obisId in obisResult) {
        const entry = obisResult[obisId];
        console.log(
            entry.idToString() + ': ' +
            SmartmeterObis.ObisNames
                .resolveObisName(entry, options.obisNameLanguage)
                .obisName + ' = ' +
            entry.valueToString()
        );
    }

    // Parse the data from the newly fetched telegram (updates even if values are identical)
    const data = {
        power:     getValue(obisResult, '1-0:16.7.0*255'),
        importKwh: getValue(obisResult, '1-0:1.8.0*255'),
        exportKwh: getValue(obisResult, '1-0:2.8.0*255'),
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    };

    console.log(`[${new Date().toLocaleTimeString()}] ☁️ Pushing to Firestore: ${data.power}W`);

    try {
        // Always save to database since this is a fresh reading request
        await db.collection("readings").add(data);
        console.log("✅ Upload Successful");
        
        // Display the uploaded data summary immediately after a successful upload
        console.log("📊 --- Uploaded Data Summary ---");
        console.log(`| Power:      ${data.power} W`);
        console.log(`| Import kWh: ${data.importKwh} kWh`);
        console.log(`| Export kWh: ${data.exportKwh} kWh`);
        console.log("---------------------------------\n");
        
    } catch (err) {
        console.error("❌ Firestore Error:", err.message);
    }
}

// Initialize the transport layer with options and callback
const smTransport = SmartmeterObis.init(options, handleSensorData);

console.log("🚀 Starting Smart Meter Task Loop (Every 10 seconds)...");

// Main worker function to trigger a single on-demand hardware read
function requestMeterData() {
    console.log(`[${new Date().toLocaleTimeString()}] 🔄 Requesting fresh data from meter hardware...`);
    smTransport.process(); 
}

// Trigger the first data request immediately on startup
requestMeterData();

// Continuously request fresh data from the physical hardware every 10 seconds
setInterval(requestMeterData, 10000);