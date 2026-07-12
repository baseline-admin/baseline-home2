/* ============================================================
   BASELINE - pro.js
   Baseline Pro tab — consultation booking calendar.
   Depends on: app.js, db.js
   ============================================================ */

var PRO_DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var PRO_MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var PRO_TIME_SLOTS  = [[12,0],[12,30],[13,0],[13,30],[14,0],[14,30],[15,0],[15,30],[16,0],[16,30]];
var PRO_MAX_WEEK_OFFSET = 2;

var ProState = {
  weekOffset: 0,
  calendarOpen: false,
  bookedTimes: new Set(),
  selectedSlotISO: null,
  bookingEmail: ''
};

function proGetMonday(d) {
  var day = d.getDay();
  var diff = (day === 0 ? -6 : 1 - day);
  var monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(d.getDate() + diff);
  return monday;
}

function proGetWeekMonday(weekOffset) {
  var monday = proGetMonday(new Date());
  monday.setDate(monday.getDate() + weekOffset * 7);
  return monday;
}

function proGetWeekDays(weekOffset) {
  var monday = proGetWeekMonday(weekOffset);
  var days = [];
  for (var i = 0; i < 5; i++) {
    var d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

function proSlotDateTime(dayDate, hm) {
  var dt = new Date(dayDate);
  dt.setHours(hm[0], hm[1], 0, 0);
  return dt;
}

function proFormatSlotLabel(hm) {
  var h = hm[0], m = hm[1];
  return (h < 10 ? '0' : '') + h + ':' + (m === 0 ? '00' : m);
}

// Deterministic per-week "manually unavailable" slots — a stand-in for real
// Google Calendar availability until that integration is wired up. Seeded by
// the week's Monday date so it's stable for everyone viewing that week.
function proHashStr(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return h;
}
function proMulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function proGetWeeklyBlockedIndices(weekOffset) {
  var monday = proGetWeekMonday(weekOffset);
  var rand = proMulberry32(proHashStr(monday.toDateString()));
  var count = 3 + Math.floor(rand() * 2); // 3 or 4
  var total = 5 * PRO_TIME_SLOTS.length;
  var indices = [];
  while (indices.length < count) {
    var idx = Math.floor(rand() * total);
    if (indices.indexOf(idx) === -1) indices.push(idx);
  }
  return indices;
}

async function renderProTab() {
  ProState.weekOffset = 0;
  ProState.calendarOpen = false;

  var panel = document.getElementById('proCalendarPanel');
  if (panel) panel.classList.remove('pro-cal-ready');

  // Set the collapsed shape (header label, chevron, hidden body) synchronously
  // before reveal — this needs no network round trip, only date math.
  renderProCalendarToggle();
  renderProWeek();

  // Reveal only once that shape is correct — same double-rAF fade-in used for
  // the last-workout card, so the panel never flashes in a wrong shape first.
  if (panel) {
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { panel.classList.add('pro-cal-ready'); });
    });
  }

  await loadProBookedSlots();
}

function renderProCalendarToggle() {
  var body = document.getElementById('proCalBody');
  var chevron = document.getElementById('proCalChevron');
  if (body) body.style.display = ProState.calendarOpen ? 'block' : 'none';
  if (chevron) chevron.innerHTML = ProState.calendarOpen ? ICON_CHEVRON_OPEN : ICON_CHEVRON_CLOSED;
}

function toggleProCalendarPanel() {
  ProState.calendarOpen = !ProState.calendarOpen;
  renderProCalendarToggle();
}

async function loadProBookedSlots() {
  try {
    var monday0 = proGetWeekMonday(0);
    var friday2 = proGetWeekDays(PRO_MAX_WEEK_OFFSET)[4];
    var rangeEnd = new Date(friday2);
    rangeEnd.setHours(23, 59, 59, 999);
    var rows = await dbGetProBookedSlots(monday0.toISOString(), rangeEnd.toISOString());
    ProState.bookedTimes = new Set(rows.map(function(r) { return new Date(r.slot_datetime).getTime(); }));
  } catch (e) {
    console.error('loadProBookedSlots error:', e);
    ProState.bookedTimes = new Set();
  }
  renderProWeek();
}

function renderProWeek(direction) {
  var wrap = document.getElementById('proCalendarBody');
  if (!wrap) return;

  var days = proGetWeekDays(ProState.weekOffset);
  var blockedIdx = proGetWeeklyBlockedIndices(ProState.weekOffset);
  var now = new Date();

  var gridHtml = days.map(function(d, dayIdx) {
    var slotsHtml = PRO_TIME_SLOTS.map(function(hm, slotIdx) {
      var dt = proSlotDateTime(d, hm);
      var flatIdx = dayIdx * PRO_TIME_SLOTS.length + slotIdx;
      var unavailable = dt.getTime() < now.getTime()
        || ProState.bookedTimes.has(dt.getTime())
        || blockedIdx.indexOf(flatIdx) !== -1;
      var cls = 'pro-slot-btn' + (unavailable ? ' pro-slot-taken' : '');
      var attrs = unavailable ? 'disabled' : ('onclick="openProBookingModal(\'' + dt.toISOString() + '\')"');
      return '<button class="' + cls + '" ' + attrs + '>' + proFormatSlotLabel(hm) + '</button>';
    }).join('');
    return '<div class="pro-cal-day">'
      + '<div class="pro-cal-day-label">' + PRO_DAY_NAMES[d.getDay()]
      + '<strong>' + d.getDate() + ' ' + PRO_MONTH_NAMES[d.getMonth()] + '</strong></div>'
      + slotsHtml
      + '</div>';
  }).join('');

  // Fresh element each render so the slide-in animation always plays —
  // direction > 0 (Next) enters from the right, < 0 (Prev) enters from the left.
  var animClass = direction > 0 ? 'page-slide-in-right' : direction < 0 ? 'page-slide-in-left' : '';
  wrap.innerHTML = '<div class="pro-cal-grid ' + animClass + '">' + gridHtml + '</div>';

  var prevBtn = document.getElementById('proCalPrevBtn');
  var nextBtn = document.getElementById('proCalNextBtn');
  if (prevBtn) prevBtn.disabled = ProState.weekOffset <= 0;
  if (nextBtn) nextBtn.disabled = ProState.weekOffset >= PRO_MAX_WEEK_OFFSET;

  var rangeLabel = document.getElementById('proCalRangeLabel');
  if (rangeLabel) {
    var first = days[0], last = days[days.length - 1];
    rangeLabel.textContent = first.getDate() + ' ' + PRO_MONTH_NAMES[first.getMonth()]
      + ' – ' + last.getDate() + ' ' + PRO_MONTH_NAMES[last.getMonth()];
  }
}

function proNavWeek(delta) {
  var next = ProState.weekOffset + delta;
  if (next < 0 || next > PRO_MAX_WEEK_OFFSET) return;
  ProState.weekOffset = next;
  renderProWeek(delta);
}

function scrollToProCalendar() {
  var panel = document.getElementById('proCalendarPanel');
  if (!panel) return;
  if (!ProState.calendarOpen) {
    ProState.calendarOpen = true;
    renderProCalendarToggle();
  }
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  panel.classList.add('pro-cal-highlight');
  setTimeout(function() { panel.classList.remove('pro-cal-highlight'); }, 1200);
}

// ── Booking modal ─────────────────────────────────────────

function formatProSlotLabel(dt) {
  return dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    + ', ' + dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function openProBookingModal(isoStr) {
  ProState.selectedSlotISO = isoStr;
  ProState.bookingEmail = (State.currentUser && State.currentUser.email) || '';

  document.getElementById('proBookSlotDisplay').textContent = formatProSlotLabel(new Date(isoStr));

  renderProBookEmailRow();
  document.getElementById('proBookNotesInput').value = '';
  document.getElementById('proBookConfirmMsg').textContent = '';
  hideProIcsLink();
  hideProGCalLink();
  hideProDetailsPanel();

  var confirmBtn = document.getElementById('proBookConfirmBtn');
  confirmBtn.disabled = false;
  confirmBtn.textContent = 'Confirm';
  confirmBtn.classList.remove('saved');

  document.getElementById('proBookingModal').classList.add('open');
}

function renderProBookEmailRow() {
  var wrap = document.getElementById('proBookEmailWrap');
  if (!wrap) return;
  wrap.innerHTML = '<span class="pro-book-email-text" id="proBookEmailText">' + ProState.bookingEmail + '</span>'
    + '<button class="icon-btn" onclick="startEditProEmail()" title="Edit email">' + ICON_EDIT + '</button>';
}

function startEditProEmail() {
  var wrap = document.getElementById('proBookEmailWrap');
  if (!wrap) return;
  wrap.innerHTML = '<input id="proBookEmailInput" type="email" class="pro-book-input" value="' + ProState.bookingEmail + '" />'
    + '<button class="icon-btn" onclick="saveProEmailEdit()" title="Save">' + ICON_CHECK + '</button>';
  var input = document.getElementById('proBookEmailInput');
  if (input) {
    input.focus(); input.select();
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') saveProEmailEdit(); });
  }
}

function saveProEmailEdit() {
  var input = document.getElementById('proBookEmailInput');
  if (!input) return;
  var val = input.value.trim();
  if (!val) return;
  ProState.bookingEmail = val;
  renderProBookEmailRow();
}

// ── Confirmation details panel ──────────────────────────────

function buildProBookingDetailsText(slotDate, userLabel, meetLink) {
  var lines = [userLabel + ' Baseline Pro Consultation Call', formatProSlotLabel(slotDate)];
  if (meetLink) lines.push(meetLink);
  return lines.join('\n');
}

function showProDetailsPanel(slotDate, userLabel, meetLink) {
  var panel = document.getElementById('proBookDetailsPanel');
  if (!panel) return;
  var text = buildProBookingDetailsText(slotDate, userLabel, meetLink);
  panel.innerHTML = '<div class="pro-book-details-text">' + text.split('\n').join('<br>') + '</div>'
    + '<div class="pro-book-details-copy-row">'
    + '<button class="icon-btn" onclick="copyProBookingDetails()" id="proBookCopyBtn" title="Copy details">' + ICON_COPY + '</button>'
    + '</div>';
  panel.setAttribute('data-copy-text', text);
  panel.style.display = 'block';
}

function hideProDetailsPanel() {
  var panel = document.getElementById('proBookDetailsPanel');
  if (!panel) return;
  panel.style.display = 'none';
  panel.innerHTML = '';
  panel.removeAttribute('data-copy-text');
}

function copyProBookingDetails() {
  var panel = document.getElementById('proBookDetailsPanel');
  var btn = document.getElementById('proBookCopyBtn');
  if (!panel || !btn) return;
  var text = panel.getAttribute('data-copy-text') || '';
  navigator.clipboard.writeText(text).then(function() {
    btn.innerHTML = ICON_CHECK;
    btn.style.opacity = '1';
    setTimeout(function() {
      btn.style.transition = 'opacity 0.3s';
      btn.style.opacity = '0';
      setTimeout(function() {
        btn.innerHTML = ICON_COPY;
        btn.style.opacity = '1';
        btn.style.transition = '';
      }, 350);
    }, 900);
  });
}

// ── Add to Calendar ──────────────────────────────────────────
// User-side only — has no bearing on the real event created on
// samuel@baseline.fitness's calendar via the backend. Offers two
// options since browser handling of .ics links is inconsistent across
// platforms: a direct Google Calendar link (predictable everywhere,
// no file-handling involved) and an .ics download for Apple/Outlook,
// served from a real endpoint (api/ics.js) rather than a client-side
// blob: URL, which is unreliable on Android Chrome.

function formatGCalDate(d) {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function buildGoogleCalendarUrl(startDate, notes, meetLink, userLabel) {
  var end = new Date(startDate.getTime() + 30 * 60000);
  var summary = (userLabel ? userLabel + ' ' : '') + 'Baseline Pro Consultation Call';
  var descParts = [];
  if (meetLink) descParts.push('Join: ' + meetLink);
  if (notes) descParts.push('Notes: ' + notes);

  var params = new URLSearchParams();
  params.set('action', 'TEMPLATE');
  params.set('text', summary);
  params.set('dates', formatGCalDate(startDate) + '/' + formatGCalDate(end));
  if (descParts.length) params.set('details', descParts.join('\n\n'));
  if (meetLink) params.set('location', meetLink);

  return 'https://calendar.google.com/calendar/render?' + params.toString();
}

function showProGCalLink(startDate, notes, meetLink, userLabel) {
  var link = document.getElementById('proBookGoogleCalLink');
  if (!link) return;
  link.href = buildGoogleCalendarUrl(startDate, notes, meetLink, userLabel);
  link.style.display = 'inline-block';
}

function hideProGCalLink() {
  var link = document.getElementById('proBookGoogleCalLink');
  if (link) link.style.display = 'none';
}

function showProIcsLink(startDate, notes, meetLink, userLabel) {
  var link = document.getElementById('proBookIcsLink');
  if (!link) return;
  var params = new URLSearchParams();
  params.set('slot', startDate.toISOString());
  if (notes) params.set('notes', notes);
  if (meetLink) params.set('meet', meetLink);
  if (userLabel) params.set('name', userLabel);
  link.href = '/api/consultation-ics?' + params.toString();
  link.style.display = 'inline-block';
}

function hideProIcsLink() {
  var link = document.getElementById('proBookIcsLink');
  if (link) link.style.display = 'none';
}

function closeProBookingModal() {
  document.getElementById('proBookingModal').classList.remove('open');
  ProState.selectedSlotISO = null;
}

function handleProBookingModalClick(e) {
  if (e.target === document.getElementById('proBookingModal')) closeProBookingModal();
}

async function submitProBooking() {
  if (!ProState.selectedSlotISO) return;
  // Commit any in-progress email edit — user may hit Confirm without
  // explicitly clicking the checkmark save button first.
  var emailInput = document.getElementById('proBookEmailInput');
  if (emailInput && emailInput.value.trim()) ProState.bookingEmail = emailInput.value.trim();
  var notesInput = document.getElementById('proBookNotesInput');
  var notes = notesInput ? notesInput.value.trim() : '';
  var confirmBtn = document.getElementById('proBookConfirmBtn');
  var msgEl = document.getElementById('proBookConfirmMsg');

  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Booking...';
  msgEl.textContent = '';

  try {
    await dbCreateProBooking(ProState.selectedSlotISO, ProState.bookingEmail, notes);

    // Show details + a working Add to Calendar link immediately — neither
    // depends on the backend Calendar call, so both work even if that's
    // slow or fails. Both upgrade in place with the real Meet link once
    // sendProConsultationInvite resolves.
    var slotDate = new Date(ProState.selectedSlotISO);
    var userLabel = (State.cachedProfile && State.cachedProfile.first_name) || ProState.bookingEmail;
    showProDetailsPanel(slotDate, userLabel, null);
    showProGCalLink(slotDate, notes, null, userLabel);
    showProIcsLink(slotDate, notes, null, userLabel);

    sendProConsultationInvite(ProState.selectedSlotISO, ProState.bookingEmail, notes).then(function(meetLink) {
      if (meetLink) {
        showProDetailsPanel(slotDate, userLabel, meetLink);
        showProGCalLink(slotDate, notes, meetLink, userLabel);
        showProIcsLink(slotDate, notes, meetLink, userLabel);
      }
    });

    confirmBtn.textContent = 'Confirmed';
    confirmBtn.classList.add('saved');
    msgEl.textContent = 'Confirmed — here are your consultation call details:';

    ProState.bookedTimes.add(new Date(ProState.selectedSlotISO).getTime());
    renderProWeek();
  } catch (e) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirm';
    if (e && e.code === '23505') {
      msgEl.textContent = 'Sorry, that slot was just booked. Please pick another.';
      loadProBookedSlots();
    } else {
      console.error('submitProBooking error:', e);
      msgEl.textContent = 'Something went wrong. Please try again.';
    }
  }
}

// Fire-and-forget: the Supabase booking above is what locks the slot, so a slow
// or failed calendar call shouldn't delay/block the "Confirmed" state the user sees.
async function sendProConsultationInvite(slotISO, email, notes) {
  try {
    var userLabel = (State.cachedProfile && State.cachedProfile.first_name) || email;
    var res = await fetch('/api/book-consultation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotISO: slotISO, email: email, notes: notes, userLabel: userLabel })
    });
    var body = await res.json().catch(function() { return {}; });
    if (!res.ok) {
      console.error('Consultation invite failed:', body.error || res.status);
      return null;
    }
    return body.meetLink || null;
  } catch (e) {
    console.error('Consultation invite request failed:', e);
    return null;
  }
}
