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

function openProBookingModal(isoStr) {
  ProState.selectedSlotISO = isoStr;
  ProState.bookingEmail = (State.currentUser && State.currentUser.email) || '';

  var dt = new Date(isoStr);
  var label = dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    + ', ' + dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('proBookSlotDisplay').textContent = label;

  renderProBookEmailRow();
  document.getElementById('proBookNotesInput').value = '';
  document.getElementById('proBookConfirmMsg').textContent = '';

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
  if (input) { input.focus(); input.select(); }
}

function saveProEmailEdit() {
  var input = document.getElementById('proBookEmailInput');
  if (!input) return;
  var val = input.value.trim();
  if (!val) return;
  ProState.bookingEmail = val;
  renderProBookEmailRow();
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
  var notesInput = document.getElementById('proBookNotesInput');
  var notes = notesInput ? notesInput.value.trim() : '';
  var confirmBtn = document.getElementById('proBookConfirmBtn');
  var msgEl = document.getElementById('proBookConfirmMsg');

  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Booking...';
  msgEl.textContent = '';

  try {
    await dbCreateProBooking(ProState.selectedSlotISO, ProState.bookingEmail, notes);
    sendProConsultationInvite(ProState.selectedSlotISO, ProState.bookingEmail, notes);

    confirmBtn.textContent = 'Confirmed';
    confirmBtn.classList.add('saved');
    msgEl.textContent = 'Confirmed — check your email.';

    ProState.bookedTimes.add(new Date(ProState.selectedSlotISO).getTime());
    renderProWeek();
    setTimeout(closeProBookingModal, 1400);
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
    if (!res.ok) {
      var body = await res.json().catch(function() { return {}; });
      console.error('Consultation invite failed:', body.error || res.status);
    }
  } catch (e) {
    console.error('Consultation invite request failed:', e);
  }
}
