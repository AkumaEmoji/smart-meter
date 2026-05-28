const SmartmeterObis = require('smartmeter-obis');

// --- Firebase Admin setup ---
const admin = require('firebase-admin');
const serviceAccount = require('./smart-meter-project-497ac-firebase-adminsdk-fbsvc-98a2a903d2.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
// ----------------------------

let latestObisData = null;

const options = {
    protocol: "SmlProtocol",
    transport: "SerialResponseTransport",
    transportSerialPort: "/dev/tty.usbserial-1140",   // change if needed
    transportSerialBaudrate: 9600,
    obisNameLanguage: 'en',
    obisFallbackMedium: 6
};

function handleSensorData(err, obisResult) {
    if (err) {
        console.error("Sensor Error:", err);
        setTimeout(() => smTransport.process(), 5000);
        return;
    }

    console.log("----- New Telegram -----");
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

    latestObisData = obisResult;
    smTransport.process();
}

async function sendToCloud() {
    if (!latestObisData) {
        console.log(`[${new Date().toLocaleTimeString()}] ⏳ Waiting for first sensor reading...`);
        return;
    }

    // Match by idToString() instead of a hardcoded object key
    const getValue = (obisCode) => {
        for (const id in latestObisData) {
            const entry = latestObisData[id];
            if (entry.idToString() === obisCode) {
                // Try the structured value first, guarding against null
                const v = entry.getValue && entry.getValue();
                if (v && v.value !== undefined && v.value !== null) {
                    return v.value;
                }
                // Fall back to parsing the string form (e.g. "0.1198 kWh" -> 0.1198)
                const parsed = parseFloat(entry.valueToString());
                return isNaN(parsed) ? 0 : parsed;
            }
        }
        return 0;
    };

    const data = {
        power:     getValue('1-0:16.7.0*255'),
        importKwh: getValue('1-0:1.8.0*255'),
        exportKwh: getValue('1-0:2.8.0*255'),
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    };

    console.log(`[${new Date().toLocaleTimeString()}] ☁️ Pushing to Firestore: ${data.power}W`);

    try {
        await db.collection("readings").add(data);
        console.log("✅ Upload Successful");
        
        // --- Display uploaded data right after uploading ---
        console.log("📊 --- Uploaded Data Summary ---");
        console.log(`| Power:      ${data.power} W`);
        console.log(`| Import kWh: ${data.importKwh} kWh`);
        console.log(`| Export kWh: ${data.exportKwh} kWh`);
        console.log("---------------------------------\n");
        
    } catch (err) {
        console.error("❌ Firestore Error:", err.message);
    }
}

console.log("🚀 Starting Smart Meter Reading...");
const smTransport = SmartmeterObis.init(options, handleSensorData);
smTransport.process();

// Push to Firebase every 10 seconds
setInterval(sendToCloud, 10000);