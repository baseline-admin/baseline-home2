/* ============================================================
   BASELINE — api/ics.js
   Builds .ics calendar file content for the Pro consultation
   "Add to Calendar" link. Served from a real endpoint (not a
   client-generated blob) — blob: + download attribute is unreliable
   on Android Chrome, so this is served with proper headers instead.
   ============================================================ */

function icsEscape(s) {
  return (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function formatIcsDate(d) {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function buildConsultationIcs({ start, notes, meetLink, userLabel }) {
  const end = new Date(start.getTime() + 30 * 60000);
  const descParts = [];
  if (meetLink) descParts.push('Join: ' + meetLink);
  if (notes) descParts.push('Notes: ' + notes);
  const description = descParts.join('\n\n');
  const summary = (userLabel ? userLabel + ' ' : '') + 'Baseline Pro Consultation Call';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Baseline//Pro Consultation//EN',
    'BEGIN:VEVENT',
    'UID:baseline-pro-' + start.getTime() + '@baseline.fitness',
    'DTSTAMP:' + formatIcsDate(new Date()),
    'DTSTART:' + formatIcsDate(start),
    'DTEND:' + formatIcsDate(end),
    'SUMMARY:' + icsEscape(summary),
  ];
  if (description) lines.push('DESCRIPTION:' + icsEscape(description));
  if (meetLink) lines.push('LOCATION:' + icsEscape(meetLink));
  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.join('\r\n');
}

module.exports = { buildConsultationIcs };
