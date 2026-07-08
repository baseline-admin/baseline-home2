/* ============================================================
   BASELINE - account.js
   Account modal — view/edit name, display ID.
   Depends on: app.js (ICON_*, State, setHeaderName, updateGreeting), db.js
   ============================================================ */

async function showAccountMenu() {
  var user    = State.currentUser;
  var profile = State.cachedProfile || {};
  var name    = profile.first_name || '';

  // Ensure a display_id exists (first-time users who signed up before this feature)
  if (!profile.display_id) {
    var newId = buildDisplayId(name);
    var updated = await dbUpsertProfile(name, newId);
    State.cachedProfile = updated;
    profile = updated;
  }

  var displayId = profile.display_id;

  var createdAt = '';
  if (user && user.created_at) {
    var d = new Date(user.created_at);
    createdAt = d.toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  }

  var body = document.getElementById('accountModalBody');
  body.innerHTML =
    '<div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;">'
    + '<div><span style="color:var(--text);font-size:13px;">' + name + '</span></div>'
    + '<button onclick="startEditName()" class="icon-btn" title="Edit name">' + ICON_EDIT + '</button>'
    + '</div>'
    + '<div id="editNameWrap" style="display:none;margin-bottom:16px;">'
    + '<input id="editNameInput" type="text" value="' + name + '" maxlength="30" '
    + 'style="background:var(--surface);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:12px;padding:6px 10px;border-radius:6px;width:100%;box-sizing:border-box;margin-bottom:8px;" />'
    + '<button onclick="saveEditName()" style="font-family:var(--mono);font-size:11px;letter-spacing:0.08em;padding:6px 16px;border:1px solid var(--accent);border-radius:20px;background:none;color:var(--accent);cursor:pointer;">Save</button>'
    + '</div>'
    + '<div style="padding:12px 0;border-top:1px solid var(--border);">'
    + '<div style="margin-bottom:6px;">Member since <span style="color:var(--text);">' + createdAt + '</span></div>'
    + '<div style="display:flex;align-items:center;justify-content:space-between;">'
    + '<span>User ID <span style="color:var(--text);" id="accountDisplayId">' + displayId + '</span></span>'
    + '<div style="display:flex;align-items:center;gap:4px;">'
    + '<button onclick="copyDisplayId()" class="icon-btn" id="copyIdBtn" title="Copy User ID">' + ICON_COPY + '</button>'
    + '<button onclick="confirmRefreshDisplayId()" class="icon-btn" title="Refresh ID">' + ICON_REFRESH + '</button>'
    + '</div>'
    + '</div>'
    + '</div>';

  document.getElementById('accountModal').classList.add('open');
}

function startEditName() {
  document.getElementById('editNameWrap').style.display = 'block';
  document.getElementById('editNameInput').focus();
}

async function saveEditName() {
  var input = document.getElementById('editNameInput');
  if (!input) return;
  var name = input.value.trim();
  if (!name) return;
  var newDisplayId = buildDisplayId(name);
  var updated = await dbUpsertProfile(name, newDisplayId);
  State.cachedProfile = updated;
  setHeaderName(name);
  updateGreeting(name);
  closeAccountModal();
}

function copyDisplayId() {
  var el = document.getElementById('accountDisplayId');
  var btn = document.getElementById('copyIdBtn');
  if (!el || !btn) return;
  navigator.clipboard.writeText(el.textContent).then(function() {
    // Swap to checkmark, fade out, fade back
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

function cancelRefreshId() {
  var p = document.getElementById('refreshConfirmPopup');
  if (p) p.remove();
}

function confirmRefreshDisplayId() {
  // Show confirmation popup overlay
  var existing = document.getElementById('refreshConfirmPopup');
  if (existing) return;

  var popup = document.createElement('div');
  popup.id = 'refreshConfirmPopup';
  popup.style.cssText = 'position:absolute;inset:0;background:rgba(30,44,53,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;border-radius:inherit;z-index:10;';
  popup.innerHTML =
    '<div style="font-family:var(--mono);font-size:13px;color:var(--text);letter-spacing:0.04em;">Refresh user ID?</div>'
    + '<div style="display:flex;gap:10px;">'
    + '<button onclick="cancelRefreshId()" '
    + 'style="font-family:var(--mono);font-size:11px;letter-spacing:0.08em;padding:7px 20px;border:1px solid var(--border);border-radius:20px;background:none;color:var(--muted);cursor:pointer;">Cancel</button>'
    + '<button onclick="doRefreshDisplayId()" '
    + 'style="font-family:var(--mono);font-size:11px;letter-spacing:0.08em;padding:7px 20px;border:1px solid var(--text);border-radius:20px;background:none;color:var(--text);cursor:pointer;">Refresh</button>'
    + '</div>';

  var box = document.querySelector('#accountModal .ex-modal-box');
  if (box) { box.style.position = 'relative'; box.appendChild(popup); }
}

async function doRefreshDisplayId() {
  var p = document.getElementById('refreshConfirmPopup');
  if (p) p.remove();
  var profile = State.cachedProfile || {};
  var name = profile.first_name || '';
  var newDisplayId = buildDisplayId(name);
  var updated = await dbUpsertProfile(name, newDisplayId);
  State.cachedProfile = updated;
  var el = document.getElementById('accountDisplayId');
  if (el) el.textContent = newDisplayId;
}

function closeAccountModal() {
  document.getElementById('accountModal').classList.remove('open');
}

function handleAccountModalClick(e) {
  if (e.target === document.getElementById('accountModal')) closeAccountModal();
}
