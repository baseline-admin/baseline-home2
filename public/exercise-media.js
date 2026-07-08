/* ============================================================
   BASELINE - exercise-media.js
   Exercise inline info/video panels — shared by Generator, Library,
   and Workouts tabs wherever an exercise name is clickable.
   Depends on: app.js
   ============================================================ */

// ── Exercise inline panels ───────────────────────────────

function openExerciseModal(el) {
  var name = el.getAttribute('data-exname');
  if (!name) return;

  // Toggle: if panel already open for this exercise, close it
  var panelId = 'expanel-' + name.replace(/[^a-zA-Z0-9]/g, '-');
  var existing = document.getElementById(panelId);
  if (existing) { existing.remove(); return; }

  // Find insertion point
  var insertAfter = el.closest('.library-card')
    || el.closest('.exercise-pair')
    || el.closest('.acc-card')
    || el.closest('.acc-grid')
    || el.parentElement;

  var panel = document.createElement('div');
  panel.id = panelId;
  panel.className = 'ex-inline-panel';

  _renderPanelContent(panel, name, []);
  insertAfter.parentNode.insertBefore(panel, insertAfter.nextSibling);
}

function _renderPanelContent(panel, name, history) {
  panel.setAttribute('data-current', name);
  panel.setAttribute('data-history', JSON.stringify(history));
  window._exWikiLinks = [];

  var media = State.sheetData && State.sheetData.exerciseMedia && State.sheetData.exerciseMedia[name];
  if (!media) return;

  var url = media.url || '';
  var isMP4 = url.toLowerCase().indexOf('.mp4') !== -1 || url.indexOf('r2.dev') !== -1;
  var isYT  = url.indexOf('youtube.com') !== -1 || url.indexOf('youtu.be') !== -1;
  var ytId  = '';
  if (isYT) {
    var m = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) || url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (m) ytId = m[1];
  }
  var thumbUrl = media.thumbnail || '';
  if (!thumbUrl && ytId) thumbUrl = 'https://img.youtube.com/vi/' + ytId + '/hqdefault.jpg';

  // Store for playback — scoped to this panel
  panel._ytId   = ytId;
  panel._isMP4  = isMP4;
  panel._vidUrl = url;

  // Breadcrumb
  var breadcrumbHtml = '';
  if (history.length > 0) {
    var crumbs = history.map(function(n, i) {
      return '<span class="ex-crumb-link" data-panel="' + panel.id + '" data-idx="' + i + '" onclick="var p=document.getElementById(this.dataset.panel);_panelGoTo(p,+this.dataset.idx)">' + n + '</span>';
    });
    crumbs.push('<span class="ex-crumb-current">' + name + '</span>');
    breadcrumbHtml = '<div class="ex-breadcrumb">' + crumbs.join('<span class="ex-crumb-sep"> › </span>') + '</div>';
  }

  // Video
  var videoHtml = '';
  if (url) {
    var thumbInner = thumbUrl
      ? '<img src="' + thumbUrl + '" alt="Play" style="width:100%;height:100%;object-fit:cover;" />'
      : '<div style="width:100%;height:100%;background:#1E2C35;"></div>';
    var thumbId = panel.id + '-thumb';
    videoHtml = '<div class="ex-media-video-col">'
      + '<div class="ex-media-thumb" id="' + thumbId + '" onclick="_playPanelVideo(this)" style="cursor:pointer;">'
      + thumbInner + '</div></div>';
  }

  // Description with wiki links
  var descHtml = '';
  if (media.description) {
    var descResult = '';
    var descStr = media.description;
    var wikiRx = /\[([^\]]+)\]/g;
    var wm; var lastIdx = 0;
    while ((wm = wikiRx.exec(descStr)) !== null) {
      var exName = wm[1];
      var exists = State.sheetData && State.sheetData.exerciseMedia && State.sheetData.exerciseMedia[exName];
      descResult += descStr.slice(lastIdx, wm.index);
      if (exists) {
        var li = window._exWikiLinks.length;
        window._exWikiLinks.push({panelId: panel.id, name: exName});
        descResult += '<span class="ex-wiki-link" onclick="_openLinkedInPanel(' + li + ')">' + exName + '</span>';
      } else {
        descResult += exName;
      }
      lastIdx = wm.index + wm[0].length;
    }
    descResult += descStr.slice(lastIdx);
    descHtml = '<div class="ex-modal-desc">' + descResult + '</div>';
  }

  var textHtml = '<div class="ex-media-text-col">'
    + '<div class="ex-modal-name">' + name + '</div>'
    + descHtml + '</div>';

  panel.innerHTML = '<div class="ex-panel-header">'
    + breadcrumbHtml
    + '<button class="ex-panel-close" onclick="this.closest(\'.ex-inline-panel\').remove()">&#x2715;</button>'
    + '</div>'
    + '<div class="ex-media-layout">' + videoHtml + textHtml + '</div>';
}

function _playPanelVideo(thumbEl) {
  var panel = thumbEl.closest('.ex-inline-panel');
  if (!panel) return;

  if (panel._isMP4) {
    // Keep thumbnail visible, insert video behind it
    var video = document.createElement('video');
    video.src        = panel._vidUrl;
    video.autoplay   = true;
    video.loop       = true;
    video.setAttribute('playsinline', '');
    video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;cursor:pointer;';
    video.onclick = function(){ this.paused ? this.play() : this.pause(); };

    // Overlay: thumbnail stays on top, fades out when video is ready
    var img = thumbEl.querySelector('img');
    if (img) {
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity 0.3s ease;z-index:2;pointer-events:none;';
      video.addEventListener('canplay', function() {
        img.style.opacity = '0';
        setTimeout(function(){ if (img.parentNode) img.remove(); }, 350);
      });
    }

    thumbEl.style.position = 'relative';
    thumbEl.insertBefore(video, thumbEl.firstChild);
    thumbEl.style.cursor = 'default';
    thumbEl.onclick = null;

  } else if (panel._ytId) {
    // YouTube — keep thumbnail, fade in iframe on top
    var iframe = document.createElement('iframe');
    iframe.src = 'https://www.youtube.com/embed/' + panel._ytId + '?rel=0&modestbranding=1&autoplay=1';
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('allow', 'autoplay;picture-in-picture');
    iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none;opacity:0;transition:opacity 0.4s ease;';
    iframe.onload = function(){ this.style.opacity = '1'; };

    thumbEl.style.position = 'relative';
    thumbEl.appendChild(iframe);
    thumbEl.style.cursor = 'default';
    thumbEl.onclick = null;
  }
}

function _openLinkedInPanel(linkIdx) {
  var link = window._exWikiLinks && window._exWikiLinks[linkIdx];
  if (!link) return;
  var panel = document.getElementById(link.panelId);
  if (!panel) return;
  var history = JSON.parse(panel.getAttribute('data-history') || '[]');
  var current = panel.getAttribute('data-current');
  history.push(current);
  _renderPanelContent(panel, link.name, history);
}

function _panelGoTo(panel, index) {
  var history = JSON.parse(panel.getAttribute('data-history') || '[]');
  var targetName = history[index];
  var newHistory = history.slice(0, index);
  _renderPanelContent(panel, targetName, newHistory);
}

// Keep closeExerciseModal for any legacy references
function closeExerciseModal() {}
function handleExModalClick() {}
function openLinkedExercise() {}
