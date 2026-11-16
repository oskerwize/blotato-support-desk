# support-kb — local MCP server for the support knowledge base

A small MCP server (stdio transport) that exposes the support team's approved
answers to Claude Code, so drafted replies stay on-brand instead of being
improvised by the model.

## Why it exists

Blotato's hosted MCP server (`https://mcp.blotato.com/mcp`) knows how to
*do* things — publish, schedule, read analytics, reply to comments. It does
not know what the support team is *allowed to say*. Pricing, refund policy,
the trial-ending API-key warning, rate limits — those live in the team's
approved answers, and an agent that guesses them will eventually tell a
customer something wrong.

This server is the other half: it serves `kb.json`, the same file the web
app's Inbox draft helper reads. One source of truth, two consumers:

- **The web app** (`GET /api/canned-replies`) — the "Suggest from message"
  button keyword-matches incoming comments/DMs against these entries.
- **Claude Code** (via `.mcp.json`) — the agent calls `search_kb` before
  drafting any customer reply, and quotes the approved wording.

## Tools

| Tool | What it does |
| --- | --- |
| `search_kb` | Keyword-search the KB; returns up to 3 best matches with full answers. No match → escalate to a human, don't guess. |
| `get_canned_reply` | Fetch one approved reply by `id`. |
| `list_canned_replies` | List every reply (`id`, `title`, `question`). |

## Run it

From the repo root (after `npm install` there):

```bash
npm run mcp
```

Or standalone:

```bash
cd mcp-support-kb
npm install
npm start
```

It speaks MCP over stdio — no port, no HTTP. It is wired into the repo's
`.mcp.json` next to the hosted Blotato server, so Claude Code loads both
when the project is opened.

## Editing the knowledge base

Edit `kb.json`. Each entry: `id`, `title`, `question`, `answer`, `keywords`
(lowercase phrases used for matching). Keep answers short, factual, and
free of promises the team can't keep (e.g. never promise a refund outcome —
point at Settings > Billing). Both the web app and this server pick up
changes on restart.
