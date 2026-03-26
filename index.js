const express = require('express');
const path = require('path');
const app = express();

// 1. Tell Express to look for your index.html in the main folder
app.use(express.static(path.join(__dirname)));

// 2. Middleware to parse JSON data from your Raspberry Pi
app.use(express.json());

// 3. Link your API file (the one that talks to Firebase)
// Note: We use require().default because of the 'export default' in data.js
const dataHandler = require('./api/data').default || require('./api/data');

app.all('/api/data', (req, res) => {
    return dataHandler(req, res);
});

// 4. Fallback: If someone goes to any other link, show the dashboard
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

module.exports = app;