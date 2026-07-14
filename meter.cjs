const SmartmeterObis = require('smartmeter-obis');
const { applicationDefault, cert, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { extractMeterReading, serializeObisResult } = require('./meter-obis.cjs');

function readPositiveInteger(name, fallback) {
    const rawValue = process.env[name];
    if (rawValue === undefined || rawValue === '') {
        return fallback;
    }

    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`${name} must be a positive integer`);
    }

    return parsed;
}

function createFirebaseCredential() {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    const explicitValues = [projectId, clientEmail, privateKey];

    if (explicitValues.every(Boolean)) {
        return cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n')
        });
    }

    if (explicitValues.some(Boolean)) {
        throw new Error('Set all three FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY values.');
    }

    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        throw new Error('Set Firebase environment variables or GOOGLE_APPLICATION_CREDENTIALS before running the meter reader.');
    }

    return applicationDefault();
}

const captureOnce = process.argv.includes('--capture-once');
const writeOnce = process.argv.includes('--write-once');
const singleRun = captureOnce || writeOnce;
let db = null;
if (!captureOnce) {
    const firebaseOptions = { credential: createFirebaseCredential() };
    if (process.env.FIREBASE_PROJECT_ID) {
        firebaseOptions.projectId = process.env.FIREBASE_PROJECT_ID;
    }

    initializeApp(firebaseOptions);
    db = getFirestore();
}
const meterId = process.env.METER_ID?.trim() || 'dtz541-demo';

const pollIntervalMs = readPositiveInteger('METER_POLL_INTERVAL_MS', 10000);
const readTimeoutMs = readPositiveInteger('METER_READ_TIMEOUT_MS', 15000);
const options = {
    protocol: 'SmlProtocol',
    transport: 'SerialResponseTransport',
    transportSerialPort: process.env.METER_SERIAL_PORT || '/dev/tty.usbserial-1140',
    transportSerialBaudrate: readPositiveInteger('METER_SERIAL_BAUDRATE', 9600),
    transportSerialMessageTimeout: readTimeoutMs,
    requestInterval: singleRun ? -1 : pollIntervalMs / 1000,
    obisNameLanguage: 'en',
    obisFallbackMedium: 6
};

let smTransport;
let singleRunFinished = false;

function finishSingleRun(exitCode) {
    if (singleRunFinished) {
        return;
    }
    singleRunFinished = true;
    process.exitCode = exitCode;

    setImmediate(() => {
        smTransport.stop(() => process.exit(exitCode));
        setTimeout(() => process.exit(exitCode), 1000).unref();
    });
}

async function handleSensorData(error, obisResult) {
    if (error) {
        console.error(`Sensor error: ${error.message || error}`);
        if (singleRun) {
            finishSingleRun(1);
        }
        return;
    }

    console.log('----- New telegram received -----');
    for (const obisId in obisResult) {
        const entry = obisResult[obisId];
        const resolvedName = SmartmeterObis.ObisNames
            .resolveObisName(entry, options.obisNameLanguage)
            .obisName;
        console.log(`${entry.idToString()}: ${resolvedName} = ${entry.valueToString()}`);
    }

    const parsed = extractMeterReading(obisResult);
    if (parsed.warnings.length > 0) {
        console.warn('OBIS mapping warnings:');
        for (const warning of parsed.warnings) {
            console.warn(`- ${warning}`);
        }
    }

    if (captureOnce) {
        console.log('----- Phase 2 capture report -----');
        console.log(JSON.stringify({
            meterDataset: parsed.meterDataset,
            mappedReading: parsed.reading,
            observedObis: serializeObisResult(obisResult),
            warnings: parsed.warnings
        }, null, 2));
        finishSingleRun(0);
        return;
    }

    const recognizedValues = [
        parsed.reading.power,
        parsed.reading.importKwh,
        parsed.reading.exportKwh,
        ...Object.values(parsed.reading.phasePowerW),
        ...Object.values(parsed.reading.voltageV),
        ...Object.values(parsed.reading.currentA),
        parsed.reading.frequencyHz
    ];
    if (!recognizedValues.some((value) => value !== null)) {
        console.error('No recognized meter measurements were found; this telegram will not be stored.');
        return;
    }

    const timestamp = FieldValue.serverTimestamp();
    const data = {
        schemaVersion: 1,
        meterId,
        source: 'meter',
        meterDataset: parsed.meterDataset,
        ...parsed.reading,
        timestamp,
        receivedAt: timestamp
    };

    const powerSummary = data.power === null ? 'unavailable' : `${data.power} W`;
    console.log(
        `[${new Date().toLocaleTimeString()}] Writing ${parsed.meterDataset} reading (${powerSummary}) to Firestore.`
    );

    try {
        await db.collection('readings').add(data);
        console.log('Upload successful.');
        console.log(
            `Power: ${powerSummary} | Import: ${data.importKwh ?? 'unavailable'} kWh | Export: ${data.exportKwh ?? 'unavailable'} kWh`
        );
        if (writeOnce) {
            finishSingleRun(0);
        }
    } catch (firestoreError) {
        console.error('Firestore error:', firestoreError.message);
        if (writeOnce) {
            finishSingleRun(1);
        }
    }
}

smTransport = SmartmeterObis.init(options, handleSensorData);

function requestMeterData() {
    console.log(`[${new Date().toLocaleTimeString()}] Requesting a fresh meter reading.`);
    smTransport.process();
}

if (captureOnce) {
    console.log(
        `Capturing one SML telegram from ${options.transportSerialPort} at ${options.transportSerialBaudrate} baud without writing to Firebase.`
    );
} else if (writeOnce) {
    console.log(
        `Reading one SML telegram from ${options.transportSerialPort} and writing one document to Firestore.`
    );
} else {
    console.log(`Starting meter reader on ${options.transportSerialPort} every ${pollIntervalMs} ms.`);
}
requestMeterData();

function stopMeterReader(signal) {
    console.log(`Stopping meter reader after ${signal}.`);
    smTransport.stop(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
}

process.once('SIGINT', () => stopMeterReader('SIGINT'));
process.once('SIGTERM', () => stopMeterReader('SIGTERM'));
