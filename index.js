const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Smart Meter Cloud API is Online');
});

module.exports = app;