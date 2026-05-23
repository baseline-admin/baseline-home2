/* ============================================================
   BASELINE — api/server.js
   One job: proxy the Google Sheet data.
   All auth and database work is done client-side via Supabase JS.
   ============================================================ */
const express = require('express');
const fetch   = require('node-fetch');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.get('/api/sheet-data', async (req, res) => {
  try {
    const response = await fetch(process.env.SHEET_API_URL);
    if (!response.ok) throw new Error('Sheet fetch failed');
    res.json(await response.json());
  } catch (err) {
    console.error('Sheet error:', err.message);
    res.status(500).json({ error: 'Could not fetch sheet data' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server on port ' + PORT));
module.exports = app;
