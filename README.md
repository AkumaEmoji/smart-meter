# Smart Meter Energy Transparency

This repository contains the existing web and data layer for the **Smartify a
Digital Meter for Energy Transparency** university project. It reads a Holley
DTZ541 meter, stores readings in Firebase Firestore, and serves the browser
dashboard plus the REST API that will power **MeterLens MR** on Meta Quest 3.

## Current data path

```text
Holley DTZ541 -> Bayha SA0013 USB optical head -> meter reader -> Firestore -> REST API -> web or MR client
```

The supported acquisition program is `meter.cjs`. It persists:

- `1-0:16.7.0*255`: current total active power in watts
- `1-0:1.8.0*255`: cumulative imported energy in kWh
- `1-0:2.8.0*255`: cumulative exported energy in kWh
- `1-0:36.7.0`, `56.7.0`, `76.7.0`: L1/L2/L3 active power when present
- `1-0:32.7.0`, `52.7.0`, `72.7.0`: L1/L2/L3 voltage when present
- `1-0:31.7.0`, `51.7.0`, `71.7.0`: L1/L2/L3 current when present
- `1-0:14.7.0`: frequency when present

Optional fields are stored only when they are present with the expected unit.
Missing registers remain `null`; a missing value is never changed to zero. A
safe raw OBIS map contains the recognized electrical measurements but excludes
meter identity fields. The capabilities route derives availability from the
latest stored reading, because the DTZ541 manufacturer-specific INFO dataset
may not be enabled on every meter.

The physical SA0013 capture on 2026-07-15 confirmed that this meter currently
sends the **complete** INFO dataset: import total, export total, and signed
total power. It does not currently send phase power, voltage, current, or
frequency through the optical interface.

## API routes

| Route | Purpose |
|---|---|
| `GET /api/v1/readings/latest` | One normalized newest reading, never served from the legacy 60-second cache |
| `GET /api/v1/readings` | Validated, bounded history plus cumulative-register energy deltas |
| `GET /api/v1/capabilities` | Actual field, transport, unit, and limit availability |
| `GET /api/data` | Backward-compatible newest-first array for the existing dashboard |
| `POST /api/data` | Bearer-authenticated legacy ingestion route |

The application currently uses REST polling. It has no WebSocket or SSE
endpoint. See `docs/API_V1.md` for the exact payload and error contract.

## Requirements

- Node.js 22 or newer
- A Firebase project with Firestore
- For real meter capture: the Bayha SA0013 USB optical head visible as a serial port

## Install and run locally

Install the locked dependency versions:

```powershell
npm ci
```

Create the ignored local environment file from the safe template:

```powershell
Copy-Item .env.example .env
```

Fill in `.env` with your own Firebase service-account values and a long random
ingestion token. `FIREBASE_PRIVATE_KEY` must be one quoted line containing the
literal `\n` separators from the JSON `private_key` value; do not paste the
whole service-account JSON object into that variable.

Important local values:

```dotenv
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=service-account@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
SMART_METER_INGEST_TOKEN=replace-with-a-long-random-secret
METER_ID=dtz541-demo
PORT=3000
```

Start the local server. The `dev` script loads `.env` automatically:

```powershell
npm run dev
```

Then inspect the local contract:

```powershell
Invoke-RestMethod http://localhost:3000/api/v1/capabilities
Invoke-RestMethod http://localhost:3000/api/v1/readings/latest
Invoke-RestMethod "http://localhost:3000/api/v1/readings?limit=20&order=asc"
```

## Run the physical meter reader

First capture one telegram without writing anything to Firebase. This reports
whether the meter is sending the reduced, complete, or manufacturer-specific
dataset and prints the observed OBIS values:

```powershell
npm run meter:capture
```

Then start continuous acquisition:

```powershell
npm run meter
```

For a one-document Firestore verification that exits automatically, use:

```powershell
npm run meter:once
```

`meter.cjs` writes directly to Firestore, so it does not use the API ingestion
token. The SA0013 normally appears as `COMn` on Windows and `/dev/ttyUSBn` on
Linux/Raspberry Pi. Set `METER_SERIAL_PORT`, `METER_SERIAL_BAUDRATE=9600`,
`METER_POLL_INTERVAL_MS`, and `METER_READ_TIMEOUT_MS` in `.env`. Alternatively,
`GOOGLE_APPLICATION_CREDENTIALS` can point to a service-account file stored
outside this repository.

## Run the API simulator

The simulator posts labeled simulated readings and requires an explicit URL and
the same ingestion token used by the server:

```powershell
$env:METER_API_URL = "http://localhost:3000/api/data"
node --env-file=.env hardware/simulate.js
```

Simulator records are exposed by v1 with `quality.source: "simulator"` and
`quality.isSimulated: true`, allowing the future Quest UI to show an honest
simulation badge.

## Verification

```powershell
npm run check
npm test
```

See `SECURITY.md` for credential rotation and Git-history cleanup. See
`METERLENS_MR_CONTEXT.md` for the code-aware handoff and the next build phase.
