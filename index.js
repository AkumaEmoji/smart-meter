const express = require('express');
const app = express();
const path = require('path');

// This tells the Back-end to serve your Front-end (index.html)
app.use(express.static(path.join(__dirname)));

// This links your custom API logic
const dataApi = require('./api/data');
app.all('/api/data', dataApi);

module.exports = app;