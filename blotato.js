/**
 * blotato.js — thin client for the Blotato REST API.
 *
 * Base URL: https://backend.blotato.com/v2
 * Auth:     `blotato-api-key` header, taken ONLY from the BLOTATO_API_KEY
 *           environment variable. The key is never logged and never sent to
 *           the browser — the frontend only talks to this app's own /api/*.
 *
 * DRY-RUN MODE: when no key is set, every function below returns realistic
 * simulated data from demo.js, flagged `demo: true` in the response, so the
 * whole app is demonstrable without a key or a paid plan. When a key IS set,
 * calls go live and responses carry `demo: false`.
 *
 * Request/response shapes follow https://help.blotato.com/api/llm.
 */
import { demoRequest } from './demo.js';

const BASE_URL = 'https://backend.blotato.com/v2';

// The 9 platforms Blotato publishes to.
export const PLATFORMS = [
  { id: 'twitter', label: 'X (Twitter)', dailyCap: '—' },
  { id: 'instagram', label: 'Instagram', dailyCap: '50/day' },
  { id: 'facebook', label: 'Facebook', dailyCap: '25/Page/day' },
  { id: 'linkedin', label: 'LinkedIn', dailyCap: '50/day' },
  { id: 'tiktok', label: 'TikTok', dailyCap: '25/day' },
  { id: 'pinterest', label: 'Pinterest', dailyCap: '10–50/day' },
  { id: 'threads', label: 'Threads', dailyCap: '—' },
  { id: 'bluesky', label: 'Bluesky', dailyCap: '—' },
  { id: 'youtube', label: 'YouTube', dailyCap: '10–25/day' },
];

export class BlotatoClient {
  constructor(apiKey) {
    this.apiKey = apiKey || null;
    this.demo = !apiKey;
  }

  async request(path, { method = 'GET', body = null, query = {} } = {}) {
    if (this.demo) {
      const data = demoRequest(path, { method, body, query });
      return { demo: true, ...data };
    }

    const url = new URL(BASE_URL + path);
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, item));
      else url.searchParams.append(k, String(v));
    }

    const res = await fetch(url, {
      method,
      headers: {
        'blotato-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // 204 No Content (PATCH/DELETE /schedules) has no body.
    if (res.status === 204) return { demo: false, ok: true };

    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      const err = new Error(data?.message || data?.error || `Blotato API error ${res.status}`);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return { demo: false, ...(data ?? {}) };
  }

  // ------------------------------------------------------------ accounts
  /** GET /users/me/accounts — returns { items: [{ id, platform, ... }] }. */
  listAccounts() {
    return this.request('/users/me/accounts');
  }

  // -------------------------------------------------------------- posts
  /**
   * POST /posts — publish now, or schedule.
   * `scheduledTime` and `useNextFreeSlot` are TOP-LEVEL fields, outside
   * `post`. Omit both to publish immediately.
   * Returns { postSubmissionId } — a receipt, NOT proof of publication.
   * Poll getPostStatus() to confirm the outcome.
   */
  publishPost({ accountId, text, platform, mediaUrls = [], scheduledTime = null, useNextFreeSlot = false }) {
    const body = {
      post: {
        accountId: String(accountId),
        content: { text, mediaUrls, platform },
        target: { targetType: platform },
      },
    };
    if (scheduledTime) body.scheduledTime = scheduledTime;
    if (useNextFreeSlot) body.useNextFreeSlot = true;
    return this.request('/posts', { method: 'POST', body });
  }

  /**
   * GET /posts/:postSubmissionId — poll until the post is `published`
   * (with a public URL) or `failed`.
   * GOTCHA: a scheduled post reports `scheduled` and NEVER becomes
   * `published` — never poll a scheduled post waiting for `published`,
   * it would hang forever.
   */
  getPostStatus(postSubmissionId) {
    return this.request(`/posts/${encodeURIComponent(postSubmissionId)}`);
  }

  /** GET /posts/:id/analytics — metrics for one published post. */
  getPostAnalytics(postId) {
    return this.request(`/posts/${encodeURIComponent(postId)}/analytics`);
  }

  // ---------------------------------------------------------- schedules
  /** GET /schedules — future scheduled posts, soonest first. */
  listSchedules({ limit = 20 } = {}) {
    return this.request('/schedules', { query: { limit } });
  }

  /** GET /schedules/:id — one scheduled post. */
  getSchedule(id) {
    return this.request(`/schedules/${encodeURIComponent(id)}`);
  }

  /** PATCH /schedules/:id — { patch: { scheduledTime?, draft? } }. */
  updateSchedule(id, patch) {
    return this.request(`/schedules/${encodeURIComponent(id)}`, { method: 'PATCH', body: { patch } });
  }

  /** DELETE /schedules/:id — cancel a scheduled post. */
  deleteSchedule(id) {
    return this.request(`/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  /** GET /schedule/slots — recurring weekly posting slots. */
  listSlots() {
    return this.request('/schedule/slots');
  }

  /** POST /schedule/slots/next-available — { platform, accountId }. */
  nextAvailableSlot(platform, accountId) {
    return this.request('/schedule/slots/next-available', { method: 'POST', body: { platform, accountId: String(accountId) } });
  }

  // ---------------------------------------------------------- analytics
  /**
   * GET /analytics — top performing posts, ranked by sortBy
   * (likes_count | comments_count | views_count | reach_count).
   * LinkedIn returns NO metrics — it is not available yet.
   */
  getAnalytics({ sortBy = 'views_count', platform = null, limit = 20 } = {}) {
    return this.request('/analytics', { query: { sortBy, platform, limit } });
  }

  // ----------------------------------------------------------- comments
  /**
   * GET /comments — Instagram and Facebook ONLY. Most recent first.
   * Inbound comments have isAuthor=false; your own have isAuthor=true.
   */
  listComments({ platform = null, accountId = null, limit = 50 } = {}) {
    return this.request('/comments', { query: { platform, accountId, limit } });
  }

  /**
   * POST /comments — reply to a top-level comment (parentCommentId) or
   * post a top-level comment on a post (postId). Replies to replies are
   * NOT supported. Returns status `queued`; poll GET /comments/:id to
   * confirm it reached `posted` or `failed`.
   */
  replyToComment({ postId, parentCommentId = null, text }) {
    const body = { text };
    if (parentCommentId) body.parentCommentId = parentCommentId;
    if (postId) body.postId = postId;
    return this.request('/comments', { method: 'POST', body });
  }

  // ----------------------------------------------------------- messages
  /** GET /conversations — Instagram and Facebook DMs, most recent first. */
  listConversations({ platform = null, limit = 50 } = {}) {
    return this.request('/conversations', { query: { platform, limit } });
  }

  /** GET /messages — filter by conversationId to read one thread. */
  listMessages({ conversationId = null, limit = 50 } = {}) {
    return this.request('/messages', { query: { conversationId, limit } });
  }

  /**
   * POST /messages — send a DM. recipientId must come from an existing
   * conversation or incoming message. target.targetType is `instagram`
   * or `facebook` (pageId required for Facebook). Returns status
   * `queued`; poll GET /messages/:id to confirm `sent` or `failed`.
   */
  sendMessage({ accountId, recipientId, text, targetType, pageId = null }) {
    const target = { targetType };
    if (pageId) target.pageId = pageId;
    return this.request('/messages', {
      method: 'POST',
      body: { accountId: String(accountId), recipientId: String(recipientId), text, target },
    });
  }
}
