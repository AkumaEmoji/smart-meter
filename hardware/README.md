# Hardware scripts

The supported meter acquisition entry point is the repository-root
`meter.cjs`. It reads SML data and writes the current `readings` Firestore
schema used by `/api/data`. The current hardware is a Bayha Electronics
SA0013 USB optical read/write head, which appears as a virtual serial port and
does not need a separate RS485-to-USB adapter.

Use `npm run meter:capture` from the repository root to inspect one telegram
without uploading it. Use `npm run meter` for continuous Firestore acquisition.
Use `npm run meter:once` to write exactly one verification document and exit.
The shared parser and guarded OBIS mapping live in `meter-obis.cjs`.

The scripts in this folder are retained as development aids and experiments:

- `simulate.js` sends a valid simulated reading to an explicitly configured API.
- `index-firebase.js` is a legacy Firebase prototype with a different collection
  and field schema; it is not the production data path.
- `logger_sqlite.js` and `SQLtest.js` are legacy SQLite prototypes. They need
  `better-sqlite3`, which is intentionally not part of the supported application
  install.

This folder has its own CommonJS package boundary so these older `require(...)`
scripts remain executable even though the web/API project uses ES modules.
