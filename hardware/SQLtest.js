'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'realtime.db');

// 1. Open the database
const db = new Database(DB_PATH);

// WAL mode is fast, but it can leave log files behind on abnormal termination,
// so switching back to DELETE (the default) is a good option here where we want to keep disk usage minimal.
db.pragma('journal_mode = DELETE');
db.pragma('synchronous = NORMAL');

// 2. Create the table
db.exec(`
  CREATE TABLE IF NOT EXISTS ticks (
    i      INTEGER PRIMARY KEY AUTOINCREMENT,
    ts_ms  INTEGER NOT NULL,
    ts_iso TEXT    NOT NULL
  );
`);

const insert = db.prepare(`INSERT INTO ticks (ts_ms, ts_iso) VALUES (?, ?)`);

let count = 0;
const MAX_ROWS = 1000; // [Added] Safety guard: automatically stop after 1,000 rows (to protect disk space)

function logOnce() {
  if (count >= MAX_ROWS) {
    console.log('--- Automatically stopped for safety (max row count reached) ---');
    shutdown();
    return;
  }

  const now = Date.now();
  const iso = new Date(now).toISOString();

  try {
    const info = insert.run(now, iso);
    count++;
    console.log(`[${count}/${MAX_ROWS}] i=${info.lastInsertRowid} ts=${iso}`);
  } catch (err) {
    console.error("Write error:", err.message);
    shutdown();
  }
}

// Start logging
console.log(`Recording started: ${DB_PATH}`);
logOnce();
const timer = setInterval(logOnce, 1000);

// 3. Shutdown handler (doing this properly helps prevent file bloat)
function shutdown() {
  console.log('\nSafely closing the database...');
  clearInterval(timer);
  try {
    db.close();
    console.log('Done.');
  } catch (e) {
    // Ignore if already closed
  }
  process.exit(0);
}

// Listen for Ctrl+C and termination signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
