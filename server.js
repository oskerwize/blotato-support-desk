/**
 * server.js — blotato-support-desk backend.
 *
 * Serves the single-page frontend from ./public and proxies the Blotato
 * REST API through /api/*. The API key lives ONLY here, read from the
 * BLOTATO_API_KEY environment variable. It is never logged, never committed,
 * and never sent to the browser — the frontend never sees it.
 *
 * Without a key the app runs in DRY-RUN mode: every Blotato call returns
 * realistic simulated data flagged `demo: true` (see demo.js).
 *
 *   npm install && npm start        -> http://localhost:3000
 *   BLOTATO_API_KEY=... npm start   -> live mode (paid plan required)
 */
import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { BlotatoClient, PLATFORMS } from './blotato.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const client = new BlotatoClient(process.env.BLOTATO_API_KEY);
const app = express();
app.use(express.json({ limit: '1mb' }));

// Canned replies share one source of truth with the local MCP server:
// mcp-support-kb/kb.json. The frontend's draft helper reads them here.
let cannedReplies = [];
try {
  cannedReplies = JSON.parse(readFileSync(path.join(__dirname, 'mcp-support-kb', 'kb.json'), 'utf8'));
} catch (err) {
  console.error('Could not load mcp-support-kb/kb.json:', err.message);
}

// ------------------------------------------------------------- helpers
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

function requireFields(res, body, fields) {
  for (const f of fields) {
    if (body[f] === undefined || body[f] === null || body[f] === '') {
      res.status(400).json({ error: `Missing required field: ${f}` });
      return false;
    }
  }
  return true;
}

// -------------------------------------------------------------- routes
app.get('/api/status', (req, res) => {
  res.json({
    demo: client.demo,
    // Boolean only — the key itself is never exposed.
    hasApiKey: Boolean(process.env.BLOTATO_API_KEY),
    platforms: PLATFORMS,
    version: '1.0.0',
  });
});

app.get('/api/accounts', asyncHandler(async (req, res) => {
  res.json(await client.listAccounts());
}));

app.post('/api/publish', asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  if (!requireFields(res, b, ['accountId', 'text', 'platform'])) return;
  if (!PLATFORMS.some((p) => p.id === b.platform)) {
    return res.status(400).json({ error: `Unknown platform: ${b.platform}` });
  }
  const mediaUrls = Array.isArray(b.mediaUrls)
    ? b.mediaUrls.filter((u) => typeof u === 'string' && u.trim())
    : [];
  res.json(await client.publishPost({
    accountId: b.accountId,
    text: b.text,
    platform: b.platform,
    mediaUrls,
    scheduledTime: b.scheduledTime || null,
    useNextFreeSlot: b.useNextFreeSlot === true,
  }));
}));

app.get('/api/posts/:postSubmissionId', asyncHandler(async (req, res) => {
  res.json(await client.getPostStatus(req.params.postSubmissionId));
}));

app.get('/api/schedules', asyncHandler(async (req, res) => {
  res.json(await client.listSchedules({ limit: Number(req.query.limit) || 20 }));
}));

app.delete('/api/schedules/:id', asyncHandler(async (req, res) => {
  res.json(await client.deleteSchedule(req.params.id));
}));

app.get('/api/slots', asyncHandler(async (req, res) => {
  res.json(await client.listSlots());
}));

app.get('/api/analytics', asyncHandler(async (req, res) => {
  res.json(await client.getAnalytics({
    sortBy: req.query.sortBy || 'views_count',
    platform: req.query.platform || null,
    limit: Number(req.query.limit) || 20,
  }));
}));

app.get('/api/analytics/:id', asyncHandler(async (req, res) => {
  res.json(await client.getPostAnalytics(req.params.id));
}));

app.get('/api/comments', asyncHandler(async (req, res) => {
  res.json(await client.listComments({
    platform: req.query.platform || null,
    accountId: req.query.accountId || null,
    limit: Number(req.query.limit) || 50,
  }));
}));

app.post('/api/comments/reply', asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  if (!requireFields(res, b, ['text'])) return;
  if (!b.postId && !b.parentCommentId) {
    return res.status(400).json({ error: 'Provide postId or parentCommentId.' });
  }
  res.json(await client.replyToComment({
    postId: b.postId || null,
    parentCommentId: b.parentCommentId || null,
    text: b.text,
  }));
}));

app.get('/api/conversations', asyncHandler(async (req, res) => {
  res.json(await client.listConversations({
    platform: req.query.platform || null,
    limit: Number(req.query.limit) || 50,
  }));
}));

app.get('/api/conversations/:id/messages', asyncHandler(async (req, res) => {
  res.json(await client.listMessages({ conversationId: req.params.id, limit: 100 }));
}));

app.post('/api/messages', asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  if (!requireFields(res, b, ['accountId', 'recipientId', 'text', 'targetType'])) return;
  if (!['instagram', 'facebook'].includes(b.targetType)) {
    return res.status(400).json({ error: 'targetType must be instagram or facebook.' });
  }
  res.json(await client.sendMessage({
    accountId: b.accountId,
    recipientId: b.recipientId,
    text: b.text,
    targetType: b.targetType,
    pageId: b.pageId || null,
  }));
}));

// Canned replies (same KB the local MCP server exposes).
app.get('/api/canned-replies', (req, res) => {
  res.json({ demo: client.demo, items: cannedReplies });
});

// ------------------------------------------------------------- static
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ------------------------------------------------------------- errors
app.use((err, req, res, _next) => {
  // Never leak the API key in an error message.
  const message = String(err?.message || 'Internal error').replace(process.env.BLOTATO_API_KEY || '___never___', '[redacted]');
  console.error(`[error] ${req.method} ${req.path}:`, message);
  res.status(err?.status || 502).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`blotato-support-desk listening on http://localhost:${PORT}`);
  console.log(client.demo
    ? 'Mode: DRY-RUN (no BLOTATO_API_KEY set — all data is simulated, demo: true)'
    : 'Mode: LIVE (BLOTATO_API_KEY set — calls hit backend.blotato.com/v2)');
});
