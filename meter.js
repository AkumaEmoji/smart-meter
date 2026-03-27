import SmartmeterObis from 'smartmeter-obis';
import fetch from 'node-fetch';

// --- Configuration ---
const VERCEL_API_URL = 'https://smart-meter-chi.vercel.app/api/data';

const options = {
    protocol: "SmlProtocol",
    transport: "SerialResponseTransport",
    transportSerialPort: "/dev/tty.usbserial-1130", // Double check this with ls /dev/tty.usb*
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

    console.log(`[${new Date().toLocaleTimeString()}] Power: ${data.power}W -> Sending to Vercel...`);

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
        setTimeout(() => smTransport.process(), 10000);
        return;
    }
    sendToCloud(obisResult);
    // Trigger the next reading (optional: use a timeout if you want to save battery/data)
    smTransport.process();
}

console.log("🚀 Starting Smart Meter Bridge...");
const smTransport = SmartmeterObis.init(options, handleSensorData);
smTransport.process();