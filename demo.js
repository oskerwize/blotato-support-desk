/**
 * demo.js — in-memory simulated Blotato backend for DRY-RUN mode.
 *
 * When no BLOTATO_API_KEY is set, the client in blotato.js routes every
 * request here instead of https://backend.blotato.com/v2. All data is fake,
 * but it follows the real API's response shapes (see
 * https://help.blotato.com/api/llm) and is STATEFUL: publishing, scheduling,
 * and replying in the demo visibly change what the app shows, so the whole
 * flow is demonstrable without a key or a paid plan.
 *
 * Nothing here ever touches the network.
 */

// ---------------------------------------------------------------- accounts
const accounts = [
  { id: '98432', platform: 'twitter',   name: 'Blotato Demo', username: 'blotato_demo',   profileImageUrl: null },
  { id: '98433', platform: 'instagram', name: 'Blotato Demo', username: 'blotato.demo',   profileImageUrl: null },
  { id: '98434', platform: 'facebook',  name: 'Blotato Demo', username: 'Blotato Demo',   profileImageUrl: null, pageName: 'Blotato Demo' },
  { id: '98435', platform: 'linkedin',  name: 'Blotato Demo', username: 'blotato-demo',   profileImageUrl: null },
  { id: '98436', platform: 'tiktok',    name: 'Blotato Demo', username: 'blotato.demo',   profileImageUrl: null },
  { id: '98437', platform: 'pinterest', name: 'Blotato Demo', username: 'blotato-demo',   profileImageUrl: null },
  { id: '98438', platform: 'threads',   name: 'Blotato Demo', username: 'blotato.demo',   profileImageUrl: null },
  { id: '98439', platform: 'bluesky',   name: 'Blotato Demo', username: 'blotato.demo',   profileImageUrl: null },
  { id: '98440', platform: 'youtube',   name: 'Blotato Demo', username: 'Blotato Demo',   profileImageUrl: null },
];

const accountById = (id) => accounts.find((a) => a.id === String(id));

// ------------------------------------------------------- published posts
// Metrics are STRINGS, matching the real /v2/analytics response.
// latestMetrics is ABSENT for the LinkedIn post: LinkedIn returns no metrics.
const publishedPosts = [
  { id: '98431', content: 'We just shipped scheduled posting for all 9 platforms — one dashboard, zero tab-switching.', postUrl: 'https://x.com/blotato_demo/status/1930000000000000001', platform: 'twitter', createdAt: '2026-11-02T09:15:00.000Z', mediaUrls: [], latestMetrics: { fetchedAt: '2026-11-09T12:00:00.000Z', metrics: { likesCount: '1240', commentsCount: '85', reachCount: '53000', viewsCount: '61200', savesCount: '310' } } },
  { id: '98430', content: 'Behind the scenes: how our support team answers 200 DMs a day without losing the human touch.', postUrl: 'https://www.instagram.com/p/DQdemo001/', platform: 'instagram', createdAt: '2026-11-04T14:30:00.000Z', mediaUrls: ['https://example.com/bts.jpg'], latestMetrics: { fetchedAt: '2026-11-09T12:00:00.000Z', metrics: { likesCount: '3120', commentsCount: '214', reachCount: '98400', viewsCount: '121000', savesCount: '1204' } } },
  { id: '98429', content: 'New in Blotato: AI drafts for your Instagram comments, trained on your own approved replies.', postUrl: 'https://www.facebook.com/blotatodemo/posts/98429', platform: 'facebook', createdAt: '2026-11-05T11:00:00.000Z', mediaUrls: [], latestMetrics: { fetchedAt: '2026-11-09T12:00:00.000Z', metrics: { likesCount: '486', commentsCount: '61', reachCount: '21400', viewsCount: '23800', savesCount: '42' } } },
  { id: '98428', content: 'POV: you scheduled a week of content in 20 minutes.', postUrl: 'https://www.tiktok.com/@blotato.demo/video/7440000000000000001', platform: 'tiktok', createdAt: '2026-11-06T16:45:00.000Z', mediaUrls: ['https://example.com/pov.mp4'], latestMetrics: { fetchedAt: '2026-11-09T12:00:00.000Z', metrics: { likesCount: '8900', commentsCount: '412', reachCount: '210000', viewsCount: '342000', savesCount: '2100' } } },
  { id: '98427', content: 'Hiring: Customer Support AI Engineer. Daily Claude Code, MCP, n8n — and you talk to customers, not just tickets.', postUrl: 'https://www.linkedin.com/posts/blotato-demo_hiring-98427', platform: 'linkedin', createdAt: '2026-11-07T10:00:00.000Z', mediaUrls: [] },
  { id: '98426', content: 'Our 2026 content calendar template — steal it, schedule it, done.', postUrl: 'https://www.pinterest.com/pin/984260000000000001/', platform: 'pinterest', createdAt: '2026-11-01T08:00:00.000Z', mediaUrls: [], latestMetrics: { fetchedAt: '2026-11-09T12:00:00.000Z', metrics: { likesCount: '640', commentsCount: '18', reachCount: '31200', viewsCount: '28900', savesCount: '3410' } } },
  { id: '98425', content: 'Hot take: your support inbox IS your content strategy. Every question is a post idea.', postUrl: 'https://www.threads.net/@blotato.demo/post/98425', platform: 'threads', createdAt: '2026-11-03T13:20:00.000Z', mediaUrls: [], latestMetrics: { fetchedAt: '2026-11-09T12:00:00.000Z', metrics: { likesCount: '912', commentsCount: '97', reachCount: '44100', viewsCount: '47200', savesCount: '88' } } },
];

// ------------------------------------------------------------ submissions
// Async-publish state machine: a publish-now submission starts as
// "processing" and flips to "published" after 2 status polls — mirroring the
// real API, where the receipt is NOT proof of publication. A scheduled
// submission reports "scheduled" and NEVER becomes "published" (do not poll
// a scheduled post waiting for published — it would hang forever).
const submissions = new Map();
let submissionSeq = 100;

const publicUrlFor = (platform, accountId) => {
  const a = accountById(accountId);
  const user = a ? a.username : 'blotato_demo';
  const n = String(Math.floor(1000000000000000000 + Math.random() * 899999999999999999));
  const code = Math.random().toString(36).slice(2, 10);
  switch (platform) {
    case 'twitter': return `https://x.com/${user}/status/${n}`;
    case 'instagram': return `https://www.instagram.com/p/D${code}/`;
    case 'facebook': return `https://www.facebook.com/blotatodemo/posts/${n.slice(0, 12)}`;
    case 'linkedin': return `https://www.linkedin.com/posts/${user}_${n.slice(0, 10)}`;
    case 'tiktok': return `https://www.tiktok.com/@${user}/video/${n}`;
    case 'pinterest': return `https://www.pinterest.com/pin/${n.slice(0, 15)}/`;
    case 'threads': return `https://www.threads.net/@${user}/post/${code}`;
    case 'bluesky': return `https://bsky.app/profile/${user}/post/${code}`;
    case 'youtube': return `https://www.youtube.com/watch?v=${code}AbC123`;
    default: return `https://blotato.com/demo/${code}`;
  }
};

// ------------------------------------------------------------- schedules
const schedules = [
  {
    id: 'sch_demo1',
    scheduledAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, '.000Z'),
    account: { id: '98432', name: 'Blotato Demo', username: 'blotato_demo', profileImageUrl: null, subaccountId: null, subId: null, subaccountName: null },
    draft: { accountId: '98432', content: { text: 'Good morning! What are you scheduling today?', mediaUrls: [], platform: 'twitter' }, target: { targetType: 'twitter' } },
  },
  {
    id: 'sch_demo2',
    scheduledAt: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, '.000Z'),
    account: { id: '98433', name: 'Blotato Demo', username: 'blotato.demo', profileImageUrl: null, subaccountId: null, subId: null, subaccountName: null },
    draft: { accountId: '98433', content: { text: 'Reel idea: 3 scheduling mistakes every creator makes. Full breakdown in the caption.', mediaUrls: [], platform: 'instagram' }, target: { targetType: 'instagram' } },
  },
];
let scheduleSeq = 100;

// -------------------------------------------------------------- comments
// Instagram + Facebook ONLY — the real API does not support comments on the
// other 7 platforms. isAuthor=false = inbound from the audience.
const comments = [
  { id: 'cmt_001', accountId: '98433', platform: 'instagram', postId: '98430', platformPostId: '17851234567890', platformCommentId: '17899876543210', authorId: '1784000001', author: { username: 'jane.doe', name: null }, isAuthor: false, text: 'Love this! How much is the Starter plan?', status: 'posted', errorCode: null, errorMessage: null, createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString() },
  { id: 'cmt_002', accountId: '98433', platform: 'instagram', postId: '98430', platformPostId: '17851234567890', platformCommentId: '17899876543211', authorId: '1784000002', author: { username: 'mike.codes', name: null }, isAuthor: false, text: 'Does the API support TikTok scheduling?', status: 'posted', errorCode: null, errorMessage: null, createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString() },
  { id: 'cmt_003', accountId: '98434', platform: 'facebook', postId: '98429', platformPostId: '98429', platformCommentId: '98429001', authorId: '101000000000001', author: { username: null, name: 'Sarah Lee' }, isAuthor: false, text: 'Can I manage multiple brands from one account?', status: 'posted', errorCode: null, errorMessage: null, createdAt: new Date(Date.now() - 8 * 3600 * 1000).toISOString() },
  { id: 'cmt_004', accountId: '98433', platform: 'instagram', postId: '98430', platformPostId: '17851234567890', platformCommentId: '17899876543212', authorId: '1784000003', author: { username: 'creator.ana', name: null }, isAuthor: false, text: 'This is exactly what my agency needed 🙌', status: 'posted', errorCode: null, errorMessage: null, createdAt: new Date(Date.now() - 26 * 3600 * 1000).toISOString() },
  { id: 'cmt_005', accountId: '98434', platform: 'facebook', postId: '98429', platformPostId: '98429', platformCommentId: '98429002', authorId: '101000000000002', author: { username: null, name: 'Tom Becker' }, isAuthor: false, text: 'My scheduled post failed — what do I do?', status: 'posted', errorCode: null, errorMessage: null, createdAt: new Date(Date.now() - 30 * 3600 * 1000).toISOString() },
];
let commentSeq = 100;

// -------------------------------------------------- conversations & DMs
const conversations = [
  { id: 'cnv_001', accountId: '98433', platform: 'instagram', participants: [{ id: '1784000000', name: 'Jamie Rivera', username: 'jamie.rivera', profileImageUrl: null }], createdAt: '2026-11-09T12:00:00Z', updatedAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString() },
  { id: 'cnv_002', accountId: '98434', platform: 'facebook', participants: [{ id: '101000000000003', name: 'Alex Chen', username: null, profileImageUrl: null }], createdAt: '2026-11-08T15:00:00Z', updatedAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString() },
  { id: 'cnv_003', accountId: '98433', platform: 'instagram', participants: [{ id: '1784000004', name: 'Priya Kapoor', username: 'priya.k', profileImageUrl: null }], createdAt: '2026-11-07T09:00:00Z', updatedAt: new Date(Date.now() - 20 * 3600 * 1000).toISOString() },
];

const messages = {
  cnv_001: [
    { id: 'msg_001', conversationId: 'cnv_001', platform: 'instagram', direction: 'incoming', senderId: '1784000000', recipientId: '17841400000000000', text: 'Hi! Is this still available?', status: 'delivered', errorCode: null, errorMessage: null, createdAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString() },
  ],
  cnv_002: [
    { id: 'msg_002', conversationId: 'cnv_002', platform: 'facebook', direction: 'incoming', senderId: '101000000000003', recipientId: '98434', text: 'Can I get a refund for the Starter plan? I signed up yesterday.', status: 'delivered', errorCode: null, errorMessage: null, createdAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString() },
    { id: 'msg_003', conversationId: 'cnv_002', platform: 'facebook', direction: 'outgoing', senderId: '98434', recipientId: '101000000000003', text: 'Hi Alex — happy to help. Refunds are handled through Settings > Billing, or I can loop in our billing team. Want me to do that?', status: 'sent', errorCode: null, errorMessage: null, createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString() },
  ],
  cnv_003: [
    { id: 'msg_004', conversationId: 'cnv_003', platform: 'instagram', direction: 'incoming', senderId: '1784000004', recipientId: '17841400000000000', text: 'How do I connect my TikTok account?', status: 'delivered', errorCode: null, errorMessage: null, createdAt: new Date(Date.now() - 20 * 3600 * 1000).toISOString() },
  ],
};
let messageSeq = 100;

// ------------------------------------------------------------ slots
// Weekly recurring slots (GET /v2/schedule/slots shape).
const slots = [
  { id: 'slot_1', hour: 9, minute: 0, day: 'monday', platform: 'twitter', accountId: '98432' },
  { id: 'slot_2', hour: 9, minute: 0, day: 'monday', platform: 'instagram', accountId: '98433' },
  { id: 'slot_3', hour: 14, minute: 0, day: 'wednesday', platform: 'twitter', accountId: '98432' },
  { id: 'slot_4', hour: 18, minute: 0, day: 'friday', platform: 'instagram', accountId: '98433' },
];

// ------------------------------------------------------- request router
// Mirrors the REST paths the client in blotato.js calls, so the demo
// exercises the exact same request shapes as live mode.
export function demoRequest(path, { method = 'GET', body = null, query = {} } = {}) {
  const [cleanPath] = path.split('?');

  // GET /users/me/accounts
  if (method === 'GET' && cleanPath === '/users/me/accounts') {
    return { items: accounts };
  }

  // POST /posts
  if (method === 'POST' && cleanPath === '/posts') {
    const post = body?.post || {};
    const accountId = post.accountId;
    const platform = post.content?.platform;
    const submissionId = `demo-sub-${submissionSeq++}`;
    const isScheduled = Boolean(body?.scheduledTime) || body?.useNextFreeSlot === true;

    if (isScheduled) {
      const when = body.scheduledTime
        ? new Date(body.scheduledTime).toISOString()
        : nextSlotTime();
      const account = accountById(accountId);
      const schedule = {
        id: `sch_demo${scheduleSeq++}`,
        scheduledAt: when,
        account: { id: accountId, name: account?.name ?? null, username: account?.username ?? null, profileImageUrl: null, subaccountId: null, subId: null, subaccountName: null },
        draft: post,
      };
      schedules.push(schedule);
      submissions.set(submissionId, { postSubmissionId: submissionId, state: { type: 'scheduled' }, scheduledAt: when, scheduleId: schedule.id });
      return { postSubmissionId: submissionId };
    }

    submissions.set(submissionId, {
      postSubmissionId: submissionId,
      state: { type: 'processing' },
      polls: 0,
      accountId,
      platform,
      text: post.content?.text ?? '',
      mediaUrls: post.content?.mediaUrls ?? [],
    });
    return { postSubmissionId: submissionId };
  }

  // GET /posts/:postSubmissionId  (poll for the outcome)
  const postStatusMatch = cleanPath.match(/^\/posts\/([^/]+)$/);
  if (method === 'GET' && postStatusMatch) {
    const sub = submissions.get(postStatusMatch[1]);
    if (!sub) return { error: 'not_found', message: `No submission ${postStatusMatch[1]} in this demo session.` };
    if (sub.state.type === 'scheduled') {
      return { postSubmissionId: sub.postSubmissionId, state: { type: 'scheduled' }, scheduledAt: sub.scheduledAt };
    }
    sub.polls += 1;
    if (sub.polls >= 2) {
      sub.state = { type: 'published' };
      sub.postUrl = publicUrlFor(sub.platform, sub.accountId);
      // The newly published post joins the analytics table.
      publishedPosts.unshift({
        id: `demo-${sub.postSubmissionId}`,
        content: sub.text,
        postUrl: sub.postUrl,
        platform: sub.platform,
        createdAt: new Date().toISOString(),
        mediaUrls: sub.mediaUrls,
        latestMetrics: { fetchedAt: new Date().toISOString(), metrics: { likesCount: '3', commentsCount: '0', reachCount: '41', viewsCount: '52', savesCount: '1' } },
      });
      return { postSubmissionId: sub.postSubmissionId, state: { type: 'published' }, postUrl: sub.postUrl };
    }
    return { postSubmissionId: sub.postSubmissionId, state: { type: 'processing' } };
  }

  // GET /posts/:id/analytics
  const postAnalyticsMatch = cleanPath.match(/^\/posts\/([^/]+)\/analytics$/);
  if (method === 'GET' && postAnalyticsMatch) {
    const post = publishedPosts.find((p) => p.id === postAnalyticsMatch[1]);
    if (!post) return { error: 'not_found', message: 'Post not found.' }
    return { id: post.id, latestMetrics: post.latestMetrics ?? null, metricsHistory: post.latestMetrics ? [post.latestMetrics] : [] };
  }

  // GET /schedules
  if (method === 'GET' && cleanPath === '/schedules') {
    const items = [...schedules].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    return { items, count: String(items.length) };
  }

  // GET /schedules/:id
  const scheduleMatch = cleanPath.match(/^\/schedules\/([^/]+)$/);
  if (method === 'GET' && scheduleMatch) {
    const s = schedules.find((x) => x.id === scheduleMatch[1]);
    if (!s) return { error: 'not_found', message: 'Schedule not found.' };
    return { schedule: s };
  }

  // PATCH /schedules/:id
  if (method === 'PATCH' && scheduleMatch) {
    const s = schedules.find((x) => x.id === scheduleMatch[1]);
    if (!s) return { error: 'not_found', message: 'Schedule not found.' };
    if (body?.patch?.scheduledTime) s.scheduledAt = new Date(body.patch.scheduledTime).toISOString();
    if (body?.patch?.draft) s.draft = body.patch.draft;
    return { ok: true };
  }

  // DELETE /schedules/:id
  if (method === 'DELETE' && scheduleMatch) {
    const idx = schedules.findIndex((x) => x.id === scheduleMatch[1]);
    if (idx === -1) return { error: 'not_found', message: 'Schedule not found.' };
    schedules.splice(idx, 1);
    return { ok: true };
  }

  // GET /schedule/slots
  if (method === 'GET' && cleanPath === '/schedule/slots') {
    return { items: slots };
  }

  // POST /schedule/slots/next-available
  if (method === 'POST' && cleanPath === '/schedule/slots/next-available') {
    return { slot: { slotId: 'slot_1', slotTime: nextSlotTime() } };
  }

  // GET /analytics — ranked by sortBy metric, highest first.
  if (method === 'GET' && cleanPath === '/analytics') {
    const sortBy = query.sortBy || 'views_count';
    const metricKey = { likes_count: 'likesCount', comments_count: 'commentsCount', views_count: 'viewsCount', reach_count: 'reachCount' }[sortBy] || 'viewsCount';
    let items = publishedPosts.map((p) => ({ ...p }));
    if (query.platform) items = items.filter((p) => p.platform === query.platform);
    items.sort((a, b) => {
      const av = Number(a.latestMetrics?.metrics?.[metricKey] ?? 0);
      const bv = Number(b.latestMetrics?.metrics?.[metricKey] ?? 0);
      return bv - av;
    });
    if (query.limit) items = items.slice(0, Number(query.limit));
    return { items };
  }

  // GET /comments
  if (method === 'GET' && cleanPath === '/comments') {
    let items = [...comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (query.platform) {
      const wanted = Array.isArray(query.platform) ? query.platform : [query.platform];
      items = items.filter((c) => wanted.includes(c.platform));
    }
    if (query.accountId) items = items.filter((c) => c.accountId === String(query.accountId));
    if (query.postId) items = items.filter((c) => c.postId === query.postId);
    if (query.limit) items = items.slice(0, Number(query.limit));
    return { items };
  }

  // GET /comments/:commentId
  const commentMatch = cleanPath.match(/^\/comments\/([^/]+)$/);
  if (method === 'GET' && commentMatch) {
    const c = comments.find((x) => x.id === commentMatch[1]);
    if (!c) return { error: 'not_found', message: 'Comment not found.' };
    return c;
  }

  // POST /comments — reply to a top-level comment (parentCommentId) or a
  // top-level comment on a post (postId). Replies to replies are not supported.
  if (method === 'POST' && cleanPath === '/comments') {
    const parent = comments.find((c) => c.id === body?.parentCommentId);
    const postId = body?.postId ?? parent?.postId ?? null;
    const accountId = parent?.accountId ?? '98433';
    const platform = parent?.platform ?? 'instagram';
    const created = {
      id: `cmt_demo${commentSeq++}`,
      accountId,
      platform,
      postId,
      platformPostId: parent?.platformPostId ?? null,
      platformCommentId: null,
      authorId: null,
      author: { username: accountById(accountId)?.username ?? null, name: null },
      isAuthor: true,
      text: body?.text ?? '',
      status: 'posted',
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      parentCommentId: body?.parentCommentId ?? null,
    };
    comments.unshift(created);
    return created;
  }

  // GET /conversations
  if (method === 'GET' && cleanPath === '/conversations') {
    let items = [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (query.platform) items = items.filter((c) => c.platform === query.platform);
    if (query.accountId) items = items.filter((c) => c.accountId === String(query.accountId));
    return { items };
  }

  // GET /messages
  if (method === 'GET' && cleanPath === '/messages') {
    let items = Object.values(messages).flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (query.conversationId) items = items.filter((m) => m.conversationId === query.conversationId);
    if (query.platform) items = items.filter((m) => m.platform === query.platform);
    if (query.limit) items = items.slice(0, Number(query.limit));
    return { items };
  }

  // POST /messages — send a DM to a recipient from an existing conversation.
  if (method === 'POST' && cleanPath === '/messages') {
    const conv = conversations.find((c) => c.participants.some((p) => p.id === String(body?.recipientId)));
    const targetType = body?.target?.targetType ?? conv?.platform ?? 'instagram';
    const created = {
      id: `msg_demo${messageSeq++}`,
      conversationId: conv?.id ?? null,
      platform: targetType,
      direction: 'outgoing',
      senderId: String(body?.accountId ?? ''),
      recipientId: String(body?.recipientId ?? ''),
      text: body?.text ?? '',
      status: 'sent',
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
    };
    if (conv) {
      (messages[conv.id] ??= []).push(created);
      conv.updatedAt = created.createdAt;
    }
    return created;
  }

  return { error: 'not_implemented', message: `Demo backend has no handler for ${method} ${cleanPath}.` };
}

function nextSlotTime() {
  // Next weekday 09:00 UTC — matches slot_1 in the demo slot list.
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(9, 0, 0, 0);
  return d.toISOString().replace(/\.\d{3}Z$/, '.000Z');
}
