// Run this when working with Tableau Desktop: npm run tableau
// Serves HTTPS on port 3001 (required by Tableau Extensions API)
const express = require('express');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

const certDir = __dirname;
const sslOptions = {
  key:  fs.readFileSync(path.join(certDir, 'localhost-key.pem')),
  cert: fs.readFileSync(path.join(certDir, 'localhost.pem')),
};

https.createServer(sslOptions, app).listen(3001, () => {
  console.log('KPI Card (HTTPS) → https://localhost:3001');
  console.log('Load manifest.trex in Tableau to connect.');
});
