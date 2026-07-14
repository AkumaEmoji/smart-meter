const fetch = require('node-fetch');

const apiUrl = process.env.METER_API_URL;
const ingestToken = process.env.SMART_METER_INGEST_TOKEN;
const intervalMs = Number(process.env.SIMULATOR_INTERVAL_MS) || 5000;

if (!apiUrl || !ingestToken) {
    console.error('Set METER_API_URL and SMART_METER_INGEST_TOKEN before running the simulator.');
    process.exit(1);
}

async function sendFakeData() {
    const fakeData = {
        meterId: process.env.METER_ID || 'dtz541-demo',
        source: 'simulator',
        power: Math.floor(Math.random() * 500),
        importKwh: 1234.56,
        exportKwh: 0
    };

    console.log(`[Simulator] Sending ${fakeData.power} W.`);

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${ingestToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(fakeData)
        });
        const result = await response.json();

        if (!response.ok) {
            throw new Error(`API returned ${response.status}: ${JSON.stringify(result)}`);
        }

        console.log('Simulated reading accepted:', result);
    } catch (error) {
        console.error('Simulator request failed:', error.message);
    }
}

sendFakeData();
setInterval(sendFakeData, intervalMs);
