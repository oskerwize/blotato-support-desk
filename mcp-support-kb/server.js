/**
 * mcp-support-kb/server.js — local MCP server (stdio transport) exposing
 * the support team's approved answers to Claude Code.
 *
 * Tools:
 *   search_kb          — keyword-search the knowledge base (kb.json)
 *   get_canned_reply   — fetch one approved reply by id
 *   list_canned_replies— list every approved reply (id + title)
 *
 * Run it from the repo root:  npm run mcp
 * Or standalone:               cd mcp-support-kb && npm install && npm start
 *
 * It is wired into .mcp.json at the repo root alongside Blotato's hosted
 * MCP server, so Claude Code sees both at once.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const kb = JSON.parse(readFileSync(path.join(__dirname, 'kb.json'), 'utf8'));

function score(entry, query) {
  const q = query.toLowerCase();
  const words = q.split(/[^a-z0-9]+/).filter(Boolean);
  let s = 0;
  const hay = `${entry.title} ${entry.question} ${entry.answer} ${(entry.keywords || []).join(' ')}`.toLowerCase();
  for (const w of words) if (w.length > 2 && hay.includes(w)) s += 1;
  for (const kw of entry.keywords || []) if (q.includes(kw.toLowerCase())) s += 2;
  return s;
}

const server = new McpServer({ name: 'support-kb', version: '1.0.0' });

server.tool(
  'search_kb',
  'Search the Blotato support knowledge base for approved answers. Use this before drafting any customer reply — the returned answers are the approved wording.',
  { query: z.string().describe('The customer question or keywords to search for') },
  async ({ query }) => {
    const ranked = kb
      .map((e) => ({ entry: e, s: score(e, query) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map((r) => ({ id: r.entry.id, title: r.entry.title, question: r.entry.question, answer: r.entry.answer }));
    return {
      content: [{
        type: 'text',
        text: ranked.length
          ? JSON.stringify(ranked, null, 2)
          : `No knowledge-base entry matched "${query}". Escalate to a human instead of guessing.`,
      }],
    };
  },
);

server.tool(
  'get_canned_reply',
  'Fetch one approved canned reply by its id (see list_canned_replies). Returns the exact approved wording to send or adapt.',
  { id: z.string().describe('The canned reply id, e.g. "pricing"') },
  async ({ id }) => {
    const entry = kb.find((e) => e.id === id);
    if (!entry) {
      return { content: [{ type: 'text', text: `No canned reply with id "${id}". Use list_canned_replies to see the available ids.` }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(entry, null, 2) }] };
  },
);

server.tool(
  'list_canned_replies',
  'List every approved canned reply in the support knowledge base (id, title, question). Use get_canned_reply to fetch the full wording.',
  {},
  async () => ({
    content: [{ type: 'text', text: JSON.stringify(kb.map((e) => ({ id: e.id, title: e.title, question: e.question })), null, 2) }],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('support-kb MCP server running (stdio). Tools: search_kb, get_canned_reply, list_canned_replies.');
