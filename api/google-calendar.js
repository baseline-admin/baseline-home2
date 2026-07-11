/* ============================================================
   BASELINE — api/google-calendar.js
   Creates Baseline Pro consultation events on samuel@baseline.fitness's
   Google Calendar via a domain-wide-delegated service account.
   No email goes to the user — sendUpdates:'none' below means Calendar
   sends nothing to attendees. The user instead gets a client-side
   .ics "Add to Calendar" link (see pro.js). The attendee is still
   listed on the event so Samuel can see who it's with when he opens
   it — Samuel's own view of the event is unaffected either way, since
   he's the organizer and sees it on his calendar regardless of this
   setting.
   ============================================================ */
const { google } = require('googleapis');

const CALENDAR_OWNER = 'samuel@baseline.fitness';
const TIMEZONE = 'Europe/London';
const SLOT_MINUTES = 30;

function loadCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not set');
  return JSON.parse(raw);
}

function getAuthClient() {
  const credentials = loadCredentials();
  return new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
    subject: CALENDAR_OWNER, // impersonate the calendar owner via domain-wide delegation
  });
}

async function createConsultationEvent({ slotISO, attendeeEmail, notes, userLabel }) {
  const auth = getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const start = new Date(slotISO);
  const end = new Date(start.getTime() + SLOT_MINUTES * 60000);

  const dateLabel = start.toLocaleString('en-GB', {
    timeZone: TIMEZONE, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const requestBody = {
    summary: userLabel + ' Baseline Pro Free Consultation Call @ ' + dateLabel,
    description: notes ? 'Notes from ' + userLabel + ':\n' + notes : undefined,
    start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
    end: { dateTime: end.toISOString(), timeZone: TIMEZONE },
    attendees: [{ email: attendeeEmail }],
    // Google Calendar generally derives the notification email's sender name
    // from the calendar owner's account profile, not this field — see the
    // account-rename fix for the real solution to that.
    organizer: { email: CALENDAR_OWNER, displayName: 'Baseline' },
    conferenceData: {
      createRequest: { requestId: 'baseline-pro-' + start.getTime() },
    },
  };

  const { data } = await calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: 1,
    sendUpdates: 'none',
    requestBody,
  });

  return { eventId: data.id, meetLink: data.hangoutLink || null };
}

module.exports = { createConsultationEvent };
