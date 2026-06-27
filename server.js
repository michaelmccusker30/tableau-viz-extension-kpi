const express = require('express');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3002;

app.use(express.static(path.join(__dirname, 'public')));
app.use('/styles', express.static(path.join(__dirname, 'styles')));
app.use('/src',    express.static(path.join(__dirname, 'src')));

app.listen(PORT, () => {
  console.log(`KPI Card (HTTP dev preview) → http://localhost:${PORT}`);
});
