// index.js
const express = require('express');
const app = express();
const path = require('path');

app.use(express.static(path.join(__dirname)));

// ADDED ".default" HERE to catch the export from data.js
const dataApi = require('./api/data').default; 

// Safety check: only mount if it's a function
if (typeof dataApi === 'function') {
    app.all('/api/data', dataApi);
} else {
    console.error("API handler is not a function! Check your exports.");
}

module.exports = app;