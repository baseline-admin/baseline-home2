/* ============================================================
   BASELINE - upgrade.js
   Upgrade modal — Conditional, Mandatory, Change-Upgrade, and
   Change-Downgrade variants are all fully wired.
   Depends on: app.js (State, getAuthHeader, sb, showPage), account.js
   (pill-btn line, showAccountMenu)
   ============================================================ */

var PRODUCT_INFO = {
  baseline: { name: 'Baseline', price: '£9.99/month', description: 'Unlimited access to the Baseline Fitness app.' },
  baseline_pro: { name: 'Baseline Pro', price: '£49.99/month', description: '1 on 1 guided programming via the Baseline app.' }
};

// Mandatory variant can't be dismissed via the X button or backdrop click —
// the only ways out are Continue (checkout) or Delete.
var upgradeModalDismissable = true;

function openUpgradeModal(kind) {
  // This modal is always opened either from the account menu or (for the
  // mandatory variant) on top of nothing — either way, the account modal
  // underneath must not stay 'open', or it reappears once this one closes.
  var accountModal = document.getElementById('accountModal');
  if (accountModal) accountModal.classList.remove('open');

  document.getElementById('upgradeModalName').textContent = 'Upgrade';
  upgradeModalDismissable = (kind !== 'mandatory');
  var closeBtn = document.getElementById('upgradeModalClose');
  if (closeBtn) closeBtn.style.display = upgradeModalDismissable ? '' : 'none';

  if (kind === 'conditional') {
    renderConditionalUpgradeModal();
  } else if (kind === 'mandatory') {
    renderMandatoryUpgradeModal();
  } else if (kind === 'change_upgrade') {
    renderChangeUpgradeModal();
  } else if (kind === 'change_downgrade') {
    renderChangeDowngradeModal();
  }

  document.getElementById('upgradeModal').classList.add('open');
}

function renderConditionalUpgradeModal() {
  var p = PRODUCT_INFO.baseline;
  document.getElementById('upgradeModalBody').innerHTML =
    '<div style="margin-bottom:4px;color:var(--text);font-size:13px;">' + p.name + ' — ' + p.price + '</div>'
    + '<div style="margin-bottom:20px;">' + p.description + '</div>'
    + '<div style="display:flex;gap:10px;">'
    + '<button class="save-btn" id="upgradeContinueBtn" onclick="continueToCheckout(\'baseline\')" style="flex:1;">Continue</button>'
    + '<button class="save-btn danger-btn" onclick="closeUpgradeModal()" style="flex:1;">Cancel</button>'
    + '</div>'
    + '<div id="upgradeMsg" style="font-family:var(--mono);font-size:11px;color:var(--accent);margin-top:10px;"></div>';
}

function renderMandatoryUpgradeModal() {
  var p = PRODUCT_INFO.baseline;
  document.getElementById('upgradeModalBody').innerHTML =
    '<div style="margin-bottom:4px;color:var(--text);font-size:13px;">' + p.name + ' — ' + p.price + '</div>'
    + '<div style="margin-bottom:12px;">' + p.description + '</div>'
    + '<div style="margin-bottom:20px;color:var(--text);">Free trial ended — upgrade to continue.</div>'
    + '<div style="display:flex;gap:10px;">'
    + '<button class="save-btn" id="upgradeContinueBtn" onclick="continueToCheckout(\'baseline\')" style="flex:1;">Continue</button>'
    + '<button class="save-btn danger-btn" onclick="confirmDeleteAccount()" style="flex:1;">Delete</button>'
    + '</div>'
    + '<div id="upgradeMsg" style="font-family:var(--mono);font-size:11px;color:var(--accent);margin-top:10px;"></div>';
}

function renderChangeUpgradeModal() {
  var pro = PRODUCT_INFO.baseline_pro;
  document.getElementById('upgradeModalBody').innerHTML =
    '<div style="margin-bottom:4px;color:var(--text);font-size:13px;">Upgrade to ' + pro.name + ' — ' + pro.price + '</div>'
    + '<div style="margin-bottom:20px;">' + pro.description + ' Book your consultation call on the Pro tab to get started.</div>'
    + '<div style="margin-bottom:4px;color:var(--text);font-size:13px;">Delete account</div>'
    + '<div style="margin-bottom:20px;">Your account will be deactivated immediately and permanently deleted in 14 days.</div>'
    + '<div style="display:flex;gap:8px;">'
    + '<button class="save-btn" onclick="goToProTab()" style="flex:1;padding-left:8px;padding-right:8px;">Upgrade</button>'
    + '<button class="save-btn danger-btn" onclick="confirmDeleteAccount()" style="flex:1;padding-left:8px;padding-right:8px;">Delete</button>'
    + '<button class="save-btn" onclick="cancelToAccountMenu()" style="flex:1;padding-left:8px;padding-right:8px;">Cancel</button>'
    + '</div>'
    + '<div id="upgradeMsg" style="font-family:var(--mono);font-size:11px;color:var(--accent);margin-top:10px;"></div>';
}

function renderChangeDowngradeModal() {
  document.getElementById('upgradeModalBody').innerHTML =
    '<div style="margin-bottom:4px;color:var(--text);font-size:13px;">Downgrade to Baseline — £9.99/month</div>'
    + '<div style="margin-bottom:20px;">You\'ll lose 1 on 1 guided programming and consultation calls. You\'ll keep unlimited access to the Baseline app.</div>'
    + '<div style="margin-bottom:4px;color:var(--text);font-size:13px;">Delete account</div>'
    + '<div style="margin-bottom:20px;">Your account will be deactivated immediately and permanently deleted in 14 days.</div>'
    + '<div style="display:flex;gap:8px;">'
    + '<button class="save-btn" id="upgradeContinueBtn" onclick="continueToCheckout(\'baseline\')" style="flex:1;padding-left:8px;padding-right:8px;">Downgrade</button>'
    + '<button class="save-btn danger-btn" onclick="confirmDeleteAccount()" style="flex:1;padding-left:8px;padding-right:8px;">Delete</button>'
    + '<button class="save-btn" onclick="cancelToAccountMenu()" style="flex:1;padding-left:8px;padding-right:8px;">Cancel</button>'
    + '</div>'
    + '<div id="upgradeMsg" style="font-family:var(--mono);font-size:11px;color:var(--accent);margin-top:10px;"></div>';
}

function goToProTab() {
  closeUpgradeModal();
  var proTabBtn = document.querySelector('.nav-tab[onclick*="pro"]');
  showPage('pro', proTabBtn);
}

function cancelToAccountMenu() {
  closeUpgradeModal();
  showAccountMenu();
}

async function continueToCheckout(tier) {
  var btn = document.getElementById('upgradeContinueBtn');
  var msg = document.getElementById('upgradeMsg');
  var originalLabel = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Redirecting...'; }
  try {
    var auth = await getAuthHeader();
    if (!auth) throw new Error('Please sign in again.');
    var res = await fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': auth },
      body: JSON.stringify({ tier: tier })
    });
    var data = await res.json();
    if (!res.ok || !data.url) throw new Error(data.error || 'Could not start checkout.');
    window.location.href = data.url;
  } catch (err) {
    if (msg) msg.textContent = err.message || 'Something went wrong.';
    if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
  }
}

// ── Delete account (mandatory-modal path) ──────────────────

function confirmDeleteAccount() {
  if (document.getElementById('deleteConfirmPopup')) return;
  var popup = document.createElement('div');
  popup.id = 'deleteConfirmPopup';
  popup.style.cssText = 'position:absolute;inset:0;background:rgba(30,44,53,0.96);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;border-radius:inherit;z-index:10;padding:24px;text-align:center;';
  popup.innerHTML =
    '<div style="font-family:var(--mono);font-size:13px;color:var(--text);letter-spacing:0.02em;max-width:280px;">Delete your account? It will be deactivated immediately and permanently deleted in 14 days.</div>'
    + '<div style="display:flex;gap:10px;">'
    + '<button onclick="cancelDeleteAccount()" style="font-family:var(--mono);font-size:11px;letter-spacing:0.08em;padding:7px 20px;border:1px solid var(--border);border-radius:20px;background:none;color:var(--muted);cursor:pointer;">Cancel</button>'
    + '<button onclick="doDeleteAccount()" style="font-family:var(--mono);font-size:11px;letter-spacing:0.08em;padding:7px 20px;border:1px solid #D9665C;border-radius:20px;background:none;color:#D9665C;cursor:pointer;">Delete</button>'
    + '</div>';
  var box = document.querySelector('#upgradeModal .ex-modal-box');
  if (box) { box.style.position = 'relative'; box.appendChild(popup); }
}

function cancelDeleteAccount() {
  var p = document.getElementById('deleteConfirmPopup');
  if (p) p.remove();
}

async function doDeleteAccount() {
  var popup = document.getElementById('deleteConfirmPopup');
  try {
    var auth = await getAuthHeader();
    if (!auth) throw new Error('Please sign in again.');
    var res = await fetch('/api/request-deletion', { method: 'POST', headers: { 'Authorization': auth } });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not delete account.');

    var when = new Date(data.scheduledDeletionAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('upgradeModalBody').innerHTML =
      '<div style="margin-bottom:20px;color:var(--text);">Your account has been deactivated and will be permanently deleted on ' + when + '. Sign back in before then to cancel the deletion.</div>'
      + '<button class="save-btn" onclick="finishAccountDeletion()" style="width:100%;">OK</button>';
    if (popup) popup.remove();
  } catch (err) {
    if (popup) popup.remove();
    var msg = document.getElementById('upgradeMsg');
    if (msg) msg.textContent = err.message || 'Something went wrong.';
  }
}

async function finishAccountDeletion() {
  upgradeModalDismissable = true; // deletion is done — this close is programmatic, not an escape hatch
  closeUpgradeModal();
  await sb.auth.signOut();
}

// ── Congrats popup (return from a completed checkout) ──────

// Called once from startApp on every load. Only does anything if the URL
// carries ?checkout=success, which Stripe's success_url adds — the param
// is stripped immediately so a refresh can't re-trigger this. Polls
// briefly for the webhook to land rather than assuming it's instant.
async function checkForCheckoutSuccess() {
  if (window.location.search.indexOf('checkout=success') === -1) return;

  var url = new URL(window.location.href);
  url.searchParams.delete('checkout');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);

  for (var attempt = 0; attempt < 5; attempt++) {
    var status = await getSubscriptionStatus();
    if (status && status.hasAccess && (status.tier === 'baseline' || status.tier === 'baseline_pro')) {
      showCongratsModal(status.tier);
      return;
    }
    await new Promise(function(resolve) { setTimeout(resolve, 1500); });
  }
  showCongratsModal(null); // webhook still hadn't landed — confirm generically rather than showing nothing
}

function showCongratsModal(tier) {
  var msg = tier === 'baseline_pro' ? 'You are now a Baseline Pro user.'
    : tier === 'baseline' ? 'You are now a Baseline user.'
    : 'Your upgrade is complete.';
  document.getElementById('congratsModalBody').textContent = msg;
  document.getElementById('congratsModal').classList.add('open');
}

function closeCongratsModal() {
  document.getElementById('congratsModal').classList.remove('open');
}

// ── Recover account (signed back in during the 14-day grace window) ─

function checkForPendingDeletion(profile) {
  if (!profile || !profile.deletion_requested_at) return;
  var when = new Date(profile.scheduled_deletion_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('recoverModalBody').textContent =
    'Your account is scheduled for deletion on ' + when + '. Would you like to recover it?';
  document.getElementById('recoverModal').classList.add('open');
}

async function recoverAccount() {
  var msg = document.getElementById('recoverModalMsg');
  try {
    var auth = await getAuthHeader();
    if (!auth) throw new Error('Please sign in again.');
    var res = await fetch('/api/cancel-deletion', { method: 'POST', headers: { 'Authorization': auth } });
    if (!res.ok) throw new Error('Could not recover account.');
    if (State.cachedProfile) {
      State.cachedProfile.deletion_requested_at = null;
      State.cachedProfile.scheduled_deletion_at = null;
    }
    document.getElementById('recoverModal').classList.remove('open');
  } catch (err) {
    if (msg) msg.textContent = err.message || 'Something went wrong.';
  }
}

function dismissRecoverModal() {
  document.getElementById('recoverModal').classList.remove('open');
}

// ── Modal chrome ────────────────────────────────────────────

function closeUpgradeModal() {
  if (!upgradeModalDismissable) return;
  document.getElementById('upgradeModal').classList.remove('open');
}

function handleUpgradeModalClick(e) {
  if (!upgradeModalDismissable) return;
  if (e.target === document.getElementById('upgradeModal')) closeUpgradeModal();
}
