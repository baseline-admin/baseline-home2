/* ============================================================
   BASELINE — api/server.js
   One job: proxy the Google Sheet data.
   All auth and database work is done client-side via Supabase JS.
   ============================================================ */
const express = require('express');
const fetch   = require('node-fetch');
const { createConsultationEvent } = require('./google-calendar');
const { buildConsultationIcs } = require('./ics');
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

app.post('/api/book-consultation', async (req, res) => {
  const { slotISO, email, notes, userLabel } = req.body || {};
  if (!slotISO || isNaN(new Date(slotISO).getTime())) {
    return res.status(400).json({ error: 'Invalid slot time' });
  }
  if (!email || typeof email !== 'string' || email.indexOf('@') === -1) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  try {
    const result = await createConsultationEvent({
      slotISO,
      attendeeEmail: email,
      notes: typeof notes === 'string' ? notes.slice(0, 2000) : '',
      userLabel: (typeof userLabel === 'string' && userLabel.trim()) ? userLabel.trim().slice(0, 80) : email,
    });
    res.json({ ok: true, meetLink: result.meetLink });
  } catch (err) {
    console.error('Consultation booking error:', err.message);
    res.status(500).json({ error: 'Could not create calendar event' });
  }
});

app.get('/api/consultation-ics', (req, res) => {
  const slot = req.query.slot;
  const start = new Date(slot);
  if (!slot || isNaN(start.getTime())) {
    return res.status(400).send('Invalid slot time');
  }
  const ics = buildConsultationIcs({
    start,
    notes: typeof req.query.notes === 'string' ? req.query.notes.slice(0, 2000) : '',
    meetLink: typeof req.query.meet === 'string' ? req.query.meet : '',
    userLabel: typeof req.query.name === 'string' ? req.query.name.slice(0, 80) : '',
  });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="baseline-pro-consultation.ics"');
  res.send(ics);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server on port ' + PORT));
module.exports = app;
