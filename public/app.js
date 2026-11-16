/* blotato-support-desk frontend — vanilla JS, no build step.
 * Talks only to this app's own /api/* routes; the Blotato API key never
 * reaches the browser. */
'use strict';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNum = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString());

let accounts = [];
let cannedReplies = [];
let selectedComment = null;
let selectedConv = null;

// ------------------------------------------------------------------ boot
async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function boot() {
  const status = await api('/api/status');
  const badge = $('mode-badge');
  badge.textContent = status.demo ? 'DRY-RUN MODE — simulated data' : 'LIVE MODE — connected to Blotato';
  badge.className = 'badge ' + (status.demo ? 'demo' : 'live');
  $('status-line').textContent = status.demo
    ? 'Dry-run: no BLOTATO_API_KEY set. Everything below is simulated data (demo: true) — set a key to go live. See README.md.'
    : 'Live: connected to Blotato with your API key. Posts, replies and DMs go to real accounts.';

  const acc = await api('/api/accounts');
  accounts = acc.items || [];
  cannedReplies = (await api('/api/canned-replies')).items || [];

  // Publish tab: platform + account pickers.
  $('pub-platform').innerHTML = status.platforms
    .map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join('');
  $('pub-platform').addEventListener('change', syncAccountPicker);
  syncAccountPicker();
  $('pub-submit').addEventListener('click', onPublish);

  // Analytics tab: platform filter.
  $('an-platform').innerHTML = '<option value="">All platforms</option>' +
    status.platforms.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join('');
  $('an-sort').addEventListener('change', loadAnalytics);
  $('an-platform').addEventListener('change', loadAnalytics);
  $('analytics-refresh').addEventListener('click', loadAnalytics);

  // Queue tab.
  $('queue-refresh').addEventListener('click', loadQueue);

  // Inbox.
  $('cm-platform').addEventListener('change', loadComments);
  document.querySelectorAll('.subtabs button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.subtabs button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      document.querySelectorAll('.subtab').forEach((x) => x.classList.remove('active'));
      $('subtab-' + b.dataset.subtab).classList.add('active');
      if (b.dataset.subtab === 'dms') loadConversations();
    });
  });

  // Tabs.
  document.querySelectorAll('.tabs button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
      $('tab-' + b.dataset.tab).classList.add('active');
      if (b.dataset.tab === 'queue') loadQueue();
      if (b.dataset.tab === 'analytics') loadAnalytics();
      if (b.dataset.tab === 'inbox') loadComments();
    });
  });

  loadComments();
}

function syncAccountPicker() {
  const platform = $('pub-platform').value;
  const list = accounts.filter((a) => a.platform === platform);
  $('pub-account').innerHTML = list.length
    ? list.map((a) => `<option value="${a.id}">${esc(a.username || a.name)} (${esc(a.platform)})</option>`).join('')
    : '<option value="">No connected account for this platform</option>';
  const cap = { twitter: '—', instagram: '50/day', facebook: '25/Page/day', linkedin: '50/day', tiktok: '25/day', pinterest: '10–50/day', threads: '—', bluesky: '—', youtube: '10–25/day' }[platform];
  $('pub-cap').textContent = list.length
    ? `Daily cap for ${platform}: ${cap}. Connect more accounts at my.blotato.com/accounts.`
    : `No ${platform} account connected yet — connect one at my.blotato.com/accounts first.`;
}

// --------------------------------------------------------------- publish
async function onPublish() {
  const btn = $('pub-submit');
  const result = $('pub-result');
  result.classList.remove('hidden');
  const when = document.querySelector('input[name="pub-when"]:checked').value;
  const media = $('pub-media').value.split(',').map((s) => s.trim()).filter(Boolean);
  let scheduledTime = null;
  let useNextFreeSlot = false;
  if (when === 'at') {
    const v = $('pub-datetime').value;
    if (!v) { result.innerHTML = '<p class="status failed">Pick a date and time to schedule.</p>'; return; }
    scheduledTime = new Date(v).toISOString();
  }
  if (when === 'slot') useNextFreeSlot = true;

  btn.disabled = true;
  result.innerHTML = '<p>Sending to Blotato…</p>';
  try {
    const data = await api('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: $('pub-account').value,
        text: $('pub-text').value,
        platform: $('pub-platform').value,
        mediaUrls: media,
        scheduledTime,
        useNextFreeSlot,
      }),
    });
    const id = data.postSubmissionId;
    if (when !== 'now') {
      // Scheduled: the submission reports `scheduled` and never becomes
      // `published` — do NOT poll it waiting for published.
      result.innerHTML = `<h3>✅ Scheduled</h3>
        <p>Submission receipt: <code>${esc(id)}</code></p>
        <p>This post is queued${scheduledTime ? ` for <b>${esc(new Date(scheduledTime).toLocaleString())}</b>` : ' in the next free slot'}.
        It will report <code>scheduled</code>, not <code>published</code> — see it in the
        <a href="#" onclick="switchTab('queue');return false;">Queue tab</a>.</p>`;
      btn.disabled = false;
      return;
    }
    // Publish now: poll until published / failed.
    result.innerHTML = `<h3>Receipt received</h3>
      <p>Submission ID: <code>${esc(id)}</code></p>
      <p>Status: <span class="status processing">processing…</span> <span id="poll-count"></span></p>
      <p class="hint">A receipt is not proof of publication — polling Blotato for the outcome.</p>`;
    let polls = 0;
    const timer = setInterval(async () => {
      polls += 1;
      const el = $('poll-count');
      if (el) el.textContent = `(poll ${polls})`;
      try {
        const st = await api(`/api/posts/${encodeURIComponent(id)}`);
        const type = st.state?.type;
        if (type === 'published') {
          clearInterval(timer);
          result.innerHTML = `<h3>✅ Published</h3>
            <p>Submission ID: <code>${esc(id)}</code></p>
            <p>Live URL: <a href="${esc(st.postUrl)}" target="_blank" rel="noopener">${esc(st.postUrl)}</a></p>`;
          btn.disabled = false;
        } else if (type === 'failed') {
          clearInterval(timer);
          result.innerHTML = `<h3>❌ Failed</h3>
            <p>Submission ID: <code>${esc(id)}</code></p>
            <p class="hint">${esc(st.errorMessage || st.state?.reason || 'Blotato reported a failure. Check Developer Platform > Logs.')}</p>`;
          btn.disabled = false;
        } else if (polls >= 15) {
          clearInterval(timer);
          result.innerHTML += '<p class="status failed">Still processing after 15 polls — check the post in Blotato before retrying (a repeat create risks a duplicate).</p>';
          btn.disabled = false;
        }
      } catch (e) {
        clearInterval(timer);
        result.innerHTML += `<p class="status failed">Polling error: ${esc(e.message)}</p>`;
        btn.disabled = false;
      }
    }, 2000);
  } catch (e) {
    result.innerHTML = `<p class="status failed">Error: ${esc(e.message)}</p>`;
    btn.disabled = false;
  }
}

function switchTab(name) {
  document.querySelector(`.tabs button[data-tab="${name}"]`).click();
}

// ----------------------------------------------------------------- queue
async function loadQueue() {
  const el = $('queue-list');
  el.innerHTML = 'Loading…';
  try {
    const data = await api('/api/schedules?limit=50');
    const items = data.items || [];
    if (!items.length) { el.innerHTML = '<p>No scheduled posts. Schedule one from the Publish tab.</p>'; return; }
    el.innerHTML = `<table><thead><tr><th>When</th><th>Platform</th><th>Account</th><th>Text</th><th></th></tr></thead><tbody>${
      items.map((s) => `<tr>
        <td>${esc(new Date(s.scheduledAt).toLocaleString())}</td>
        <td><span class="pill">${esc(s.draft?.content?.platform || s.account?.platform || '')}</span></td>
        <td>${esc(s.account?.username || s.account?.name || s.account?.id || '')}</td>
        <td>${esc(s.draft?.content?.text || '')}</td>
        <td><button class="danger" data-del="${esc(s.id)}">Cancel</button></td>
      </tr>`).join('')
    }</tbody></table>`;
    el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Cancel this scheduled post?')) return;
      await api(`/api/schedules/${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' });
      loadQueue();
    }));
  } catch (e) {
    el.innerHTML = `<p class="status failed">Error: ${esc(e.message)}</p>`;
  }
}

// ------------------------------------------------------------- analytics
async function loadAnalytics() {
  const el = $('analytics-list');
  const sortBy = $('an-sort').value;
  const platform = $('an-platform').value;
  $('an-note').textContent = platform === 'linkedin'
    ? 'LinkedIn returns no metrics yet — Blotato analytics are not available for LinkedIn.'
    : 'Ranked by ' + $('an-sort').selectedOptions[0].textContent + '. Metrics are Blotato’s latest collected snapshot per post.';
  el.innerHTML = 'Loading…';
  try {
    const q = new URLSearchParams({ sortBy, limit: 20 });
    if (platform) q.set('platform', platform);
    const data = await api('/api/analytics?' + q.toString());
    const items = data.items || [];
    if (!items.length) { el.innerHTML = '<p>No posts with metrics in this view.</p>'; return; }
    el.innerHTML = `<table><thead><tr><th>Post</th><th>Platform</th><th class="num">Views</th><th class="num">Reach</th><th class="num">Likes</th><th class="num">Comments</th></tr></thead><tbody>${
      items.map((p) => {
        const m = p.latestMetrics?.metrics || {};
        return `<tr>
          <td>${p.postUrl ? `<a href="${esc(p.postUrl)}" target="_blank" rel="noopener">${esc(p.content)}</a>` : esc(p.content)}</td>
          <td><span class="pill">${esc(p.platform)}</span></td>
          <td class="num">${fmtNum(m.viewsCount)}</td>
          <td class="num">${fmtNum(m.reachCount)}</td>
          <td class="num">${fmtNum(m.likesCount)}</td>
          <td class="num">${fmtNum(m.commentsCount)}</td>
        </tr>`;
      }).join('')
    }</tbody></table>`;
  } catch (e) {
    el.innerHTML = `<p class="status failed">Error: ${esc(e.message)}</p>`;
  }
}

// ----------------------------------------------------------------- inbox
// Local template draft: keyword-match the incoming text against the support
// knowledge base. This is a LOCAL template lookup — no external AI call.
function suggestDraft(text) {
  const lower = (text || '').toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const entry of cannedReplies) {
    let score = 0;
    for (const kw of entry.keywords || []) {
      if (lower.includes(kw.toLowerCase())) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = entry; }
  }
  return best;
}

function draftBoxHTML(contextText, targetId) {
  return `<div class="draft-box">
    <div class="label">💡 Suggested draft — local template, no AI call</div>
    <p class="hint">Pick a canned reply or let the template matcher suggest one, then edit before sending. Nothing is sent until you press Approve &amp; Send.</p>
    <label>Canned reply
      <select id="draft-pick-${targetId}">
        <option value="">— choose a canned reply —</option>
        ${cannedReplies.map((c) => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('')}
      </select>
    </label>
    <button class="small" id="draft-suggest-${targetId}">Suggest from message</button>
    <label style="margin-top:.6rem">Reply text
      <textarea id="draft-text-${targetId}" rows="4"></textarea>
    </label>
    <button class="primary" id="draft-send-${targetId}">Approve &amp; Send</button>
    <span id="draft-status-${targetId}" style="margin-left:.6rem"></span>
  </div>`;
}

function wireDraftBox(targetId, contextText, onSend) {
  $('draft-pick-' + targetId).addEventListener('change', (e) => {
    const entry = cannedReplies.find((c) => c.id === e.target.value);
    if (entry) $('draft-text-' + targetId).value = entry.answer;
  });
  $('draft-suggest-' + targetId).addEventListener('click', () => {
    const entry = suggestDraft(contextText);
    if (entry) {
      $('draft-text-' + targetId).value = entry.answer;
      $('draft-status-' + targetId).textContent = `Matched: ${entry.title}`;
    } else {
      $('draft-status-' + targetId).textContent = 'No template matched — type a reply.';
    }
  });
  $('draft-send-' + targetId).addEventListener('click', async () => {
    const text = $('draft-text-' + targetId).value.trim();
    if (!text) { $('draft-status-' + targetId).textContent = 'Reply is empty.'; return; }
    $('draft-status-' + targetId).textContent = 'Sending…';
    try {
      await onSend(text);
      $('draft-status-' + targetId).textContent = '✅ Sent.';
    } catch (e) {
      $('draft-status-' + targetId).textContent = 'Error: ' + e.message;
    }
  });
}

async function loadComments() {
  const el = $('comments-list');
  $('comment-detail').classList.add('hidden');
  el.innerHTML = 'Loading…';
  try {
    const q = new URLSearchParams({ limit: 50 });
    const platform = $('cm-platform').value;
    if (platform) q.set('platform', platform);
    const data = await api('/api/comments?' + q.toString());
    const items = (data.items || []).filter((c) => !c.isAuthor);
    if (!items.length) { el.innerHTML = '<p>No inbound comments found.</p>'; return; }
    el.innerHTML = items.map((c) => `<div class="item" data-id="${esc(c.id)}">
      <div class="meta">${esc(c.platform)} · ${esc(c.author?.username || c.author?.name || 'unknown')} · ${esc(new Date(c.createdAt).toLocaleString())}</div>
      <div class="text">${esc(c.text)}</div>
    </div>`).join('');
    el.querySelectorAll('.item').forEach((n) => n.addEventListener('click', () => {
      el.querySelectorAll('.item').forEach((x) => x.classList.remove('selected'));
      n.classList.add('selected');
      selectedComment = items.find((c) => c.id === n.dataset.id);
      showCommentDetail();
    }));
  } catch (e) {
    el.innerHTML = `<p class="status failed">Error: ${esc(e.message)}</p>`;
  }
}

function showCommentDetail() {
  const c = selectedComment;
  const el = $('comment-detail');
  el.classList.remove('hidden');
  const author = c.author?.username || c.author?.name || 'unknown';
  el.innerHTML = `<h3>Reply to @${esc(author)} <span class="pill">${esc(c.platform)}</span></h3>
    <p>${esc(c.text)}</p>
    <p class="hint">Replies to replies are not supported — this replies to the top-level comment. Replying counts @${esc(author)} as an active contact for the month.</p>
    ${draftBoxHTML(c.text, 'cmt')}`;
  wireDraftBox('cmt', c.text, async (text) => {
    await api('/api/comments/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId: c.postId, parentCommentId: c.id, text }),
    });
    loadComments();
  });
}

async function loadConversations() {
  const el = $('conv-list');
  el.innerHTML = 'Loading…';
  try {
    const data = await api('/api/conversations?limit=50');
    const items = data.items || [];
    if (!items.length) { el.innerHTML = '<p>No conversations found.</p>'; return; }
    el.innerHTML = items.map((c) => {
      const p = c.participants?.[0] || {};
      return `<div class="item" data-id="${esc(c.id)}">
        <div class="meta">${esc(c.platform)} · ${esc(new Date(c.updatedAt).toLocaleString())}</div>
        <div class="text"><b>${esc(p.name || p.username || 'unknown')}</b>${p.username ? ` (@${esc(p.username)})` : ''}</div>
      </div>`;
    }).join('');
    el.querySelectorAll('.item').forEach((n) => n.addEventListener('click', () => {
      el.querySelectorAll('.item').forEach((x) => x.classList.remove('selected'));
      n.classList.add('selected');
      selectedConv = items.find((c) => c.id === n.dataset.id);
      showThread();
    }));
  } catch (e) {
    el.innerHTML = `<p class="status failed">Error: ${esc(e.message)}</p>`;
  }
}

async function showThread() {
  const c = selectedConv;
  const el = $('thread');
  el.classList.remove('hidden');
  const p = c.participants?.[0] || {};
  el.innerHTML = `<h3>${esc(p.name || p.username || 'Conversation')} <span class="pill">${esc(c.platform)}</span></h3><div id="thread-msgs">Loading…</div>`;
  try {
    const data = await api(`/api/conversations/${encodeURIComponent(c.id)}/messages`);
    const msgs = data.items || [];
    const lastIncoming = [...msgs].reverse().find((m) => m.direction === 'incoming');
    $('thread-msgs').innerHTML = (msgs.length ? msgs.map((m) => `<div class="msg ${esc(m.direction)}">
        <div>${esc(m.text)}</div>
        <div class="meta">${esc(m.direction)} · ${esc(new Date(m.createdAt).toLocaleString())} · ${esc(m.status || '')}</div>
      </div>`).join('') : '<p>No messages yet.</p>')
      + draftBoxHTML(lastIncoming?.text || '', 'dm');
    wireDraftBox('dm', lastIncoming?.text || '', async (text) => {
      await api('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: c.accountId,
          recipientId: p.id,
          text,
          targetType: c.platform,
        }),
      });
      showThread();
    });
  } catch (e) {
    $('thread-msgs').innerHTML = `<p class="status failed">Error: ${esc(e.message)}</p>`;
  }
}

boot().catch((e) => {
  $('status-line').textContent = 'Failed to load: ' + e.message;
});
