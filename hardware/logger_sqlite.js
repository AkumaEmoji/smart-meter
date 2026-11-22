'use strict';

// 1. Load the library (tool) for working with the database
const Database = require('better-sqlite3');

// 2. Create or connect to a database file named "realtime.db"
const db = new Database('realtime.db');

// 3. Create a "table" to store the data
// Configured to store timestamps (as text) in a column named ts
db.exec("CREATE TABLE IF NOT EXISTS ticks (ts TEXT)");

// Prepare the insert statement
const insert = db.prepare("INSERT INTO ticks (ts) VALUES (?)");

console.log("--- Starting 10-second write test ---");

let count = 0;

// 4. Timer that runs every 1 second (1000 milliseconds)
const timer = setInterval(() => {
    const now = new Date().toISOString(); // Get the current timestamp

    // 💾 Save to the database (execute write!)
    insert.run(now);

    count++;
    console.log(`[${count}/10] Wrote to database: ${now}`);

    // 5. Exit safely after 10 writes so the file doesn't keep growing unexpectedly
    if (count >= 10) {
        clearInterval(timer); // Stop the timer
        db.close();          // Safely close the database
        console.log("--- Test finished. 'realtime.db' should now be created ---");
        process.exit();      // Exit the program
    }
}, 1000);
