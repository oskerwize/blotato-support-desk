# 🥔 blotato-support-desk

A working support-desk demo app built with the **Blotato API** — publish and
schedule posts across 9 social platforms, watch the queue, rank posts by
analytics, and answer Instagram/Facebook comments and DMs from one inbox,
with on-brand reply drafts from a local knowledge base.

Built for the **Customer Support AI Engineer** application at Blotato
(Sabrina Ramonov, hiring via LinkedIn DM). The application asks for a public
GitHub repo with a working app vibe-coded with the Blotato API, plus a demo
video — this repo is that app.

## What it does

| Tab | What you can do |
| --- | --- |
| **Publish** | Compose a post, pick 1 of 9 platforms and a connected account, publish now **or** schedule for a date/time **or** use the next free slot. Shows the submission receipt, then polls Blotato until the post is `published` (with a live URL) or `failed`. |
| **Queue** | All future scheduled posts, soonest first. Cancel any of them before they publish. |
| **Analytics** | Top posts ranked by views / reach / likes / comments, filterable by platform. LinkedIn shows no metrics — Blotato doesn't return them yet. |
| **Inbox** | Instagram + Facebook comments and DMs (the only platforms the API supports for these). Click a comment or conversation, get a **local template-based draft** from the support knowledge base (clearly labeled — no external AI call), edit it, then approve & send through the API. |

## Setup

Requires **Node 20+** (built and verified on Node 24).

```bash
npm install
npm start
# → http://localhost:3000
```

### Dry-run mode (default — no key needed)

With no API key set, the app runs in **dry-run mode**: every Blotato call
returns realistic simulated data, flagged `demo: true` in every response,
and the banner reads `DRY-RUN MODE`. The simulation is stateful — publish a
post and it appears in Analytics; schedule one and it shows up in the
Queue; reply to a comment and your reply appears in the Inbox. The whole
app is fully demonstrable without an account, a key, or a paid plan.

### Live mode (optional)

```bash
cp .env.example .env   # then put your key in .env
# or:
BLOTATO_API_KEY=your_key_here npm start
```

With a key set, calls go to `https://backend.blotato.com/v2` and responses
carry `demo: false`. The key is read only from the environment, never
logged, never committed (`.env` is gitignored), and never sent to the
browser — the frontend only talks to this app's own `/api/*` routes.

## Getting an API key

1. Sign up / log in at **https://my.blotato.com**
2. Go to **Settings > API** and generate a key.
3. Paste it into `.env` as `BLOTATO_API_KEY`.

> ⚠️ **Warning: generating a key ends your free trial and starts billing.**
> API access requires a paid plan — **Starter is $29/month**. Do not generate
> a key just to try this demo; dry-run mode exists precisely so you don't
> have to.

## Connecting social accounts

API calls use your already-connected accounts — the API can't connect one
for you. Connect or reconnect at **https://my.blotato.com/accounts**
(Accounts > Connect account, or an existing account's actions menu >
Reconnect). The app lists them via `GET /v2/users/me/accounts` and uses
each account's `id` as the `accountId` when publishing.

If you connected an account before comments/DMs launched, reconnect it so
Blotato has the new permission, or the Inbox endpoints return 404/422.

## How it works

```
public/            vanilla-JS single-page frontend (no build step)
server.js          Express backend — /api/* routes + static frontend
blotato.js         Blotato REST client (live fetch or demo.js, same shapes)
demo.js            in-memory simulated Blotato backend for dry-run mode
mcp-support-kb/    local MCP server: the support knowledge base
.mcp.json          Claude Code config: hosted Blotato MCP + local support-kb
```

### The async-polling gotcha (the most important thing this app gets right)

A `POST /v2/posts` returns `{ postSubmissionId }` — a **receipt, not
proof**. The post is still being processed. You must poll
`GET /v2/posts/:postSubmissionId` until it reports `published` (with a
public URL) or `failed`. This app does exactly that: after publishing, it
polls every 2 seconds (max 15 polls) and shows the live outcome.

The trap: a **scheduled** post reports `scheduled` and **never** becomes
`published`. If you poll a scheduled post waiting for `published`, you hang
forever. This app never polls scheduled posts — it shows the schedule and
points you at the Queue tab instead. The same receipt-then-poll pattern
applies to comments (`queued` → `posted`/`failed`) and DMs (`queued` →
`sent`/`failed`).

### Rate limits

- `POST /v2/posts`: **30 requests/minute**
- Most reads: **60 requests/minute**
- The app polls at 2-second intervals (well under the limits) and only
  polls while a publish is in flight.

### Platforms

X (Twitter), LinkedIn, Facebook, Instagram, Pinterest, TikTok, Threads,
Bluesky, YouTube. Daily caps: Instagram 50, Facebook 25/Page, LinkedIn 50,
TikTok 25, Pinterest 10–50, YouTube 10–25.

**Inbox limits:** comments and DMs are **Instagram and Facebook only** —
the API doesn't support them on the other 7 platforms. Comments are kept
45 days, are not backfilled, and you can reply to a top-level comment but
not to a reply. Replying to someone counts them as an active contact for
the month. LinkedIn returns **no analytics metrics** yet.

## MCP — two servers, two jobs

This repo wires **two** MCP servers into Claude Code via `.mcp.json` at the
repo root. They do different things, and that's the point:

### 1. Blotato's hosted MCP server — the hands

```json
"blotato": {
  "type": "http",
  "url": "https://mcp.blotato.com/mcp",
  "headers": { "blotato-api-key": "${BLOTATO_API_KEY}" }
}
```

35 tools, hosted by Blotato. This is how an agent *acts*: list accounts,
publish, schedule, read analytics, reply to comments and DMs. It needs a
real API key (same trial-ending warning as above), and with no key it
simply isn't available — which is why the app itself runs in dry-run mode
instead.

### 2. `mcp-support-kb` (local, stdio) — the brain

```json
"support-kb": { "command": "node", "args": ["mcp-support-kb/server.js"] }
```

A local server exposing three tools — `search_kb`, `get_canned_reply`,
`list_canned_replies` — backed by `mcp-support-kb/kb.json`, the support
team's approved answers.

**Why it exists:** the hosted server knows how to *do* things, but not what
the team is *allowed to say*. Pricing, refund policy, the trial-ending
key warning, rate limits — if an agent guesses those, it will eventually
tell a customer something wrong. This server is the guardrail: Claude Code
calls `search_kb` before drafting any customer reply, and quotes the
approved wording. The web app's Inbox draft helper reads the **same**
`kb.json`, so the app and the agent can never drift apart.

Run it standalone: `npm run mcp` (from the repo root), or
`cd mcp-support-kb && npm install && npm start`. See
`mcp-support-kb/README.md` for the tool reference.

## Project layout

```
blotato-support-desk/
├── server.js            Express backend + /api/* routes
├── blotato.js           REST client (listAccounts, publishPost, getPostStatus,
│                          listSchedules, getAnalytics, listComments,
│                          listConversations, replyToComment, sendMessage…)
├── demo.js              stateful simulated Blotato backend (dry-run mode)
├── public/              index.html, app.js, styles.css (vanilla JS, no build)
├── mcp-support-kb/      local MCP server + kb.json + README
├── .mcp.json            Claude Code: hosted Blotato MCP + local support-kb
├── .env.example         BLOTATO_API_KEY placeholder (never put a real key here)
├── package.json         express, @modelcontextprotocol/sdk, zod
└── README.md            this file
```

## Demo video talking points

*(For the application video — what was built, which MCP servers were added
and why, the biggest challenge, how issues were debugged.)*

**What was built.** A full support desk on the Blotato REST API: publish-now
/ schedule / next-free-slot across 9 platforms, a cancellable schedule
queue, analytics ranked by views/reach/likes/comments, and an inbox for
Instagram/Facebook comments and DMs with template-based draft replies that
a human approves before sending. It runs with zero config in dry-run mode,
and goes live with one environment variable.

**MCP servers — and why two.** Blotato's hosted MCP server (35 tools) is
the hands: it performs the actions. The local `support-kb` MCP server is
the brain: it serves the support team's approved answers so drafted replies
stay on-brand. An agent with only the hosted server can act but will
improvise policy; an agent with only the KB can answer but can't do
anything. Together, the agent drafts from approved wording and executes
through the real API — and a human still approves every send.

**Biggest challenge.** The async lifecycle. A publish call returns a
receipt, not a result, and the failure mode is silent: a scheduled post
reports `scheduled` forever, so naive polling hangs. The fix was modeling
each submission as a small state machine (processing → published/failed,
scheduled as a terminal state) and making the UI show the receipt, the
polls, and the final URL — never claiming success from the receipt alone.
The same pattern applies to comments and DMs (`queued` → `posted`/`sent`).

**How issues were debugged.** The Blotato field reference
(https://help.blotato.com/api/llm) was read first and the client was built
to its exact shapes — `scheduledTime`/`useNextFreeSlot` as top-level
fields outside `post`, `state.type` as the status field, string metrics in
analytics, IG/FB-only inbox. Every backend route was then curled in
dry-run mode and checked for 200s and sane JSON, and the local MCP server
was started and asked to list its tools over stdio. No live Blotato call
was made during development — there is no key, and generating one would
end the free trial and start paid billing.

## Known limits

- **No live key was tested.** Everything was verified in dry-run mode.
  Live mode needs a paid Starter plan ($29/mo) and a real key.
- **Inbox is Instagram + Facebook only** (API limitation, not the app's).
- **LinkedIn has no analytics** in Blotato yet.
- **Dry-run data is simulated** and in-memory: it resets when the server
  restarts, and the published URLs are plausible fakes, not real posts.
- Comments are not backfilled by Blotato and are retained 45 days; replies
  to replies are not supported.
