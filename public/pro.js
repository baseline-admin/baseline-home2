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

// Three mutually-exclusive views share #pagePro: the marketing/booking view
// (everyone else), the coaching view (Baseline Pro subscribers), and the
// coach inbox (the one hardcoded coach account). Branches on the cached
// State.subscriptionStatus (populated in startApp/account menu/checkout
// success) rather than fetching here, so switching to the Pro tab never
// flashes the wrong shape while a request is in flight.
async function renderProTab() {
  var sub = State.subscriptionStatus;
  var marketing = document.getElementById('proMarketingView');
  var coaching = document.getElementById('proCoachingView');
  var coachInbox = document.getElementById('proCoachInboxView');

  stopProChatPoll();
  stopCoachInboxPoll();

  if (sub && sub.isCoach) {
    if (marketing) marketing.style.display = 'none';
    if (coaching) coaching.style.display = 'none';
    if (coachInbox) coachInbox.style.display = 'block';
    await renderCoachInbox();
    return;
  }

  if (sub && sub.tier === 'baseline_pro') {
    if (marketing) marketing.style.display = 'none';
    if (coachInbox) coachInbox.style.display = 'none';
    if (coaching) coaching.style.display = 'block';
    await renderProCoachingView();
    return;
  }

  if (coaching) coaching.style.display = 'none';
  if (coachInbox) coachInbox.style.display = 'none';
  if (marketing) marketing.style.display = 'block';
  renderProMarketingView();
}

function renderProMarketingView() {
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

  loadProBookedSlots();
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
    var userLabel = normalizeUserName(State.cachedProfile && State.cachedProfile.first_name) || ProState.bookingEmail;
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

// ── Pro coaching: video upload ──────────────────────────────
// Chat body text and video filenames are the first free user-entered text
// this app renders as HTML — everything else (workout names, prompts) comes
// from the sheet, not a user — so this is a genuinely new escaping need.
function proEscapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function renderProCoachingView() {
  await loadProVideos();
  await loadProChatThread();
  startProChatPoll();
}

async function handleProVideoFileSelected(e) {
  var file = e.target.files && e.target.files[0];
  e.target.value = ''; // allow re-selecting the same file later
  if (!file) return;

  var msg = document.getElementById('proVideoUploadMsg');
  var btn = document.getElementById('proVideoUploadBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Uploading...'; }
  if (msg) msg.textContent = '';

  try {
    var auth = await getAuthHeader();
    if (!auth) throw new Error('Please sign in again.');

    var presignRes = await fetch('/api/pro-video-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': auth },
      body: JSON.stringify({ filename: file.name, contentType: file.type })
    });
    var presignData = await presignRes.json();
    if (!presignRes.ok || !presignData.uploadUrl) throw new Error(presignData.error || 'Could not start upload.');

    var putRes = await fetch(presignData.uploadUrl, { method: 'PUT', body: file });
    if (!putRes.ok) throw new Error('Upload to storage failed.');

    var confirmRes = await fetch('/api/pro-video-confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': auth },
      body: JSON.stringify({ key: presignData.key, originalFilename: file.name })
    });
    var confirmData = await confirmRes.json();
    if (!confirmRes.ok) throw new Error(confirmData.error || 'Could not confirm upload.');

    prependProVideoCard(confirmData);
    if (msg) msg.textContent = 'Uploaded.';
  } catch (err) {
    console.error('handleProVideoFileSelected error:', err);
    if (msg) msg.textContent = err.message || 'Something went wrong.';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Upload training video'; }
  }
}

async function loadProVideos() {
  try {
    var res = await sb.from('pro_videos')
      .select('id, original_filename, created_at')
      .eq('user_id', State.currentUser.id)
      .order('created_at', { ascending: false });
    if (res.error) throw res.error;
    renderProVideoList(res.data || []);
  } catch (err) {
    console.error('loadProVideos error:', err);
    var wrap = document.getElementById('proVideoList');
    if (wrap) wrap.innerHTML = '<div class="lw-meta">Could not load videos.</div>';
  }
}

// Styled identically to the homepage's "Previous session" card
// (.last-workout-card/.lw-*, session-cards.js) — collapsed by default,
// video itself only fetched (via a fresh presigned URL) when expanded.
function renderProVideoList(videos) {
  var wrap = document.getElementById('proVideoList');
  if (!wrap) return;
  if (!videos.length) {
    wrap.innerHTML = '<div class="lw-meta">No videos uploaded yet.</div>';
    return;
  }
  wrap.innerHTML = videos.map(proVideoCardHtml).join('');
  videos.forEach(function(v) { wireProVideoCard(v.id); });
}

function proVideoCardHtml(v) {
  var dateStr = new Date(v.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  var name = proEscapeHtml(v.original_filename || 'Training video');
  return '<div class="last-workout-card pro-video-card" id="pro-video-card-' + v.id + '" data-collapsed="true" style="margin-top:12px;">'
    + '<div class="lw-header" style="cursor:pointer;">'
    + '<span class="lw-label">' + name + ' <span class="lw-header-date">' + dateStr + '</span></span>'
    + '</div>'
    + '<div class="lw-body" style="display:none;">'
    + '<div class="lw-meta" id="pro-video-body-' + v.id + '">Tap to load video</div>'
    + '</div>'
    + '</div>';
}

function wireProVideoCard(id) {
  var card = document.getElementById('pro-video-card-' + id);
  if (!card) return;
  var header = card.querySelector('.lw-header');
  if (header) header.addEventListener('click', function() { toggleProVideoCard(id); });
}

function prependProVideoCard(v) {
  var wrap = document.getElementById('proVideoList');
  if (!wrap) return;
  if (wrap.querySelector('.lw-meta') && !wrap.querySelector('.pro-video-card')) wrap.innerHTML = '';
  wrap.insertAdjacentHTML('afterbegin', proVideoCardHtml(v));
  wireProVideoCard(v.id);
}

function toggleProVideoCard(id) {
  var card = document.getElementById('pro-video-card-' + id);
  if (!card) return;
  var isCollapsed = card.getAttribute('data-collapsed') === 'true';
  card.setAttribute('data-collapsed', isCollapsed ? 'false' : 'true');
  var body = card.querySelector('.lw-body');
  if (body) body.style.display = isCollapsed ? 'block' : 'none';
  if (isCollapsed) loadProVideoPlayback(id);
}

async function loadProVideoPlayback(id) {
  var target = document.getElementById('pro-video-body-' + id);
  if (!target || target.getAttribute('data-loaded') === 'true') return;
  try {
    var auth = await getAuthHeader();
    if (!auth) throw new Error('Please sign in again.');
    var res = await fetch('/api/pro-video-view-url?id=' + encodeURIComponent(id), { headers: { 'Authorization': auth } });
    var data = await res.json();
    if (!res.ok || !data.viewUrl) throw new Error(data.error || 'Could not load video.');
    target.innerHTML = '<video controls style="width:100%;border-radius:8px;display:block;" src="' + data.viewUrl + '"></video>';
    target.setAttribute('data-loaded', 'true');
  } catch (err) {
    console.error('loadProVideoPlayback error:', err);
    target.textContent = err.message || 'Could not load video.';
  }
}

// ── Pro coaching: chat ───────────────────────────────────────

var proChatPollTimer = null;

async function loadProChatThread() {
  try {
    var res = await sb.from('pro_messages')
      .select('sender, body, created_at')
      .eq('user_id', State.currentUser.id)
      .order('created_at', { ascending: true });
    if (res.error) throw res.error;
    renderProChatThread(res.data || []);
  } catch (err) {
    console.error('loadProChatThread error:', err);
    var wrap = document.getElementById('proChatThread');
    if (wrap) wrap.innerHTML = '<div class="lw-meta">Could not load messages.</div>';
  }
}

function renderProChatThread(messages) {
  var wrap = document.getElementById('proChatThread');
  if (!wrap) return;
  if (!messages.length) {
    wrap.innerHTML = '<div class="lw-meta">No messages yet — say hello!</div>';
    return;
  }
  wrap.innerHTML = messages.map(function(m) {
    var cls = 'pro-chat-msg ' + (m.sender === 'coach' ? 'pro-chat-msg-coach' : 'pro-chat-msg-user');
    var time = new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return '<div class="' + cls + '">' + proEscapeHtml(m.body) + '<div class="pro-chat-msg-time">' + time + '</div></div>';
  }).join('');
  wrap.scrollTop = wrap.scrollHeight;
}

async function sendProChatMessage() {
  var input = document.getElementById('proChatInput');
  var btn = document.getElementById('proChatSendBtn');
  if (!input) return;
  var body = input.value.trim();
  if (!body) return;

  if (btn) btn.disabled = true;
  try {
    var res = await sb.from('pro_messages').insert({ user_id: State.currentUser.id, sender: 'user', body: body });
    if (res.error) throw res.error;
    input.value = '';
    await loadProChatThread();
  } catch (err) {
    console.error('sendProChatMessage error:', err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function startProChatPoll() {
  stopProChatPoll();
  proChatPollTimer = setInterval(function() {
    if (document.hidden) return;
    loadProChatThread();
  }, 4000);
}

function stopProChatPoll() {
  if (proChatPollTimer) { clearInterval(proChatPollTimer); proChatPollTimer = null; }
}

// ── Coach inbox ──────────────────────────────────────────────

var CoachInboxState = { inbox: [], expandedUserId: null };
var coachThreadPollTimer = null;
var coachListPollTimer = null;

async function renderCoachInbox() {
  await loadCoachInbox();
  startCoachInboxPoll();
}

async function loadCoachInbox() {
  var wrap = document.getElementById('proCoachInboxList');
  try {
    var auth = await getAuthHeader();
    if (!auth) throw new Error('Please sign in again.');
    var res = await fetch('/api/coach-inbox', { headers: { 'Authorization': auth } });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load inbox.');
    CoachInboxState.inbox = data.inbox || [];
    renderCoachInboxList();
  } catch (err) {
    console.error('loadCoachInbox error:', err);
    if (wrap) wrap.innerHTML = '<div class="lw-meta">Could not load inbox.</div>';
  }
}

function renderCoachInboxList() {
  var wrap = document.getElementById('proCoachInboxList');
  if (!wrap) return;
  if (!CoachInboxState.inbox.length) {
    wrap.innerHTML = '<div class="lw-meta">No Baseline Pro subscribers yet.</div>';
    return;
  }
  wrap.innerHTML = CoachInboxState.inbox.map(coachInboxCardHtml).join('');
  CoachInboxState.inbox.forEach(function(entry) {
    var header = document.getElementById('coach-card-header-' + entry.userId);
    if (header) header.addEventListener('click', function() { toggleCoachThread(entry.userId); });
  });
  // Re-render the expanded thread's messages if one was open before this refresh
  if (CoachInboxState.expandedUserId) loadCoachThread(CoachInboxState.expandedUserId);
}

function coachInboxCardHtml(entry) {
  var isOpen = CoachInboxState.expandedUserId === entry.userId;
  var name = proEscapeHtml(entry.firstName || 'Unnamed user');
  var previewParts = [];
  if (entry.lastMessage) {
    var who = entry.lastMessage.sender === 'coach' ? 'You: ' : '';
    previewParts.push(who + entry.lastMessage.body);
  }
  if (entry.videoCount) previewParts.push(entry.videoCount + ' video' + (entry.videoCount === 1 ? '' : 's'));
  var preview = previewParts.length ? proEscapeHtml(previewParts.join(' &middot; ')) : 'No activity yet';
  return '<div class="last-workout-card pro-video-card" id="coach-card-' + entry.userId + '" data-collapsed="' + (isOpen ? 'false' : 'true') + '" style="margin-top:12px;">'
    + '<div class="lw-header" id="coach-card-header-' + entry.userId + '" style="cursor:pointer;">'
    + '<span class="lw-label">' + name + '</span>'
    + '</div>'
    + '<div class="lw-body" style="display:' + (isOpen ? 'block' : 'none') + ';">'
    + '<div class="lw-meta" style="margin-bottom:12px;">' + preview + '</div>'
    + '<div class="pro-chat-thread" id="coach-thread-' + entry.userId + '"></div>'
    + '<div class="pro-chat-input-row">'
    + '<textarea class="pro-chat-input" id="coach-reply-input-' + entry.userId + '" placeholder="Reply..." rows="2"></textarea>'
    + '<button class="pro-cta-btn" style="width:auto;margin:0;" onclick="sendCoachReply(\'' + entry.userId + '\')">Send</button>'
    + '</div>'
    + '</div>'
    + '</div>';
}

function toggleCoachThread(userId) {
  var wasOpen = CoachInboxState.expandedUserId === userId;
  CoachInboxState.expandedUserId = wasOpen ? null : userId;
  stopCoachThreadPoll();
  renderCoachInboxList();
  if (!wasOpen) {
    loadCoachThread(userId);
    startCoachThreadPoll(userId);
  }
}

async function loadCoachThread(userId) {
  var wrap = document.getElementById('coach-thread-' + userId);
  if (!wrap) return;
  try {
    var res = await sb.from('pro_messages')
      .select('sender, body, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (res.error) throw res.error;
    var messages = res.data || [];
    wrap.innerHTML = messages.length ? messages.map(function(m) {
      var cls = 'pro-chat-msg ' + (m.sender === 'coach' ? 'pro-chat-msg-coach' : 'pro-chat-msg-user');
      var time = new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      return '<div class="' + cls + '">' + proEscapeHtml(m.body) + '<div class="pro-chat-msg-time">' + time + '</div></div>';
    }).join('') : '<div class="lw-meta">No messages yet.</div>';
    wrap.scrollTop = wrap.scrollHeight;
  } catch (err) {
    console.error('loadCoachThread error:', err);
  }
}

async function sendCoachReply(userId) {
  var input = document.getElementById('coach-reply-input-' + userId);
  if (!input) return;
  var body = input.value.trim();
  if (!body) return;
  try {
    var res = await sb.from('pro_messages').insert({ user_id: userId, sender: 'coach', body: body });
    if (res.error) throw res.error;
    input.value = '';
    await loadCoachThread(userId);
  } catch (err) {
    console.error('sendCoachReply error:', err);
  }
}

// Thread-list summary polls slowly; the one open thread (if any) polls
// faster — a coach with many subscribers polling every thread every few
// seconds would be a much heavier query pattern than one open thread.
function startCoachInboxPoll() {
  stopCoachInboxPoll();
  coachListPollTimer = setInterval(function() {
    if (document.hidden) return;
    loadCoachInbox();
  }, 20000);
}

function stopCoachInboxPoll() {
  if (coachListPollTimer) { clearInterval(coachListPollTimer); coachListPollTimer = null; }
  stopCoachThreadPoll();
}

function startCoachThreadPoll(userId) {
  coachThreadPollTimer = setInterval(function() {
    if (document.hidden) return;
    loadCoachThread(userId);
  }, 4000);
}

function stopCoachThreadPoll() {
  if (coachThreadPollTimer) { clearInterval(coachThreadPollTimer); coachThreadPollTimer = null; }
}

// Fire-and-forget: the Supabase booking above is what locks the slot, so a slow
// or failed calendar call shouldn't delay/block the "Confirmed" state the user sees.
async function sendProConsultationInvite(slotISO, email, notes) {
  try {
    var userLabel = normalizeUserName(State.cachedProfile && State.cachedProfile.first_name) || email;
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
