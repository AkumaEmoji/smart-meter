export default function handler(req, res) {
  res.status(200).send("Cloud API is Active");
}

const SmartmeterObis = require('smartmeter-obis');
const fetch = require('node-fetch');
// Entrypoint for Vercel

// --- Configuration ---
// Replace with your actual Vercel deployment URL
const VERCEL_API_URL = 'https://smart-meter-chi.vercel.app/api/data';

const options = {
    protocol: "SmlProtocol",
    transport: "SerialResponseTransport",
    transportSerialPort: "/dev/tty.usbserial-130", // Change this if Raspi uses a different port
    transportSerialBaudrate: 9600,
    obisNameLanguage: 'en',
    obisFallbackMedium: 6
};

// --- Data Transmission Logic ---
async function sendToCloud(obisResult) {
    const data = {
        power: obisResult['1-0:16.7.0*255']?.value || 0,
        importKwh: obisResult['1-0:1.8.0*255']?.value || 0,
        exportKwh: obisResult['1-0:2.8.0*255']?.value || 0,
        raw_data: obisResult
    };

    console.log(`[${new Date().toLocaleTimeString()}] Sending: ${data.power}W to Vercel...`);

    try {
        const response = await fetch(VERCEL_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            console.log("✅ Upload Successful");
        } else {
            console.error("❌ Upload Failed:", response.statusText);
        }
    } catch (err) {
        console.error("❌ Network Error:", err.message);
    }
}

// --- Main Callback ---
function handleSensorData(err, obisResult) {
    if (err) {
        console.error("Sensor Error:", err);
        // Wait 10 seconds and try to restart process if it fails
        setTimeout(() => smTransport.process(), 10000);
        return;
    }

    // Send data to Vercel
    sendToCloud(obisResult);

    // Trigger the next reading
    smTransport.process();
}

// --- Start the Process ---
console.log("Starting Smart Meter Bridge...");
console.log(`Monitoring USB Port: ${options.transportSerialPort}`);

const smTransport = SmartmeterObis.init(options, handleSensorData);
smTransport.process();