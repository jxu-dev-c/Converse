# Converse

Converse is a research chatbot over openFDA OTC drug labels. It retrieves reference material from Upstash Vector and streams answers from DeepSeek through AI SDK 7. It is for research only, not medical advice.

## Stack

- Next.js 16 (App Router, Turbopack, `proxy.ts`), React 19, Node 24
- AI SDK 7, `@ai-sdk/react` 4, `@ai-sdk/deepseek` 3
- DeepSeek `deepseek-v4-flash`, with thinking disabled for chat and query rewriting
- Upstash Vector with hosted embeddings, Redis history, and per-user rate limits
- Existing Lucia / AWS DynamoDB authentication
- NextUI, Tailwind CSS, and sanitized Markdown rendering with marked / DOMPurify

## Local setup

```bash
source ~/.nvm/nvm.sh
nvm install 24
nvm use
npm install
cp .env.example .env.local
```

Fill in `.env.local` with a DeepSeek API key, the existing Upstash credentials, and the existing AWS / DynamoDB auth settings. The Vector index must contain OTC label text as `data` and support hosted embeddings. Auth also expects the existing `converse-sessions` table and `lucia-sessions-user-index` index. `.env.local` is gitignored; never commit credentials.

`DEEPSEEK_MODEL` is optional and defaults to `deepseek-v4-flash`. `TOGETHER_AI_API_KEY` and `QSTASH_TOKEN` are no longer used. See [.env.example](.env.example) for all variable names.

Set `MAINTENANCE_MODE=off` locally, then:

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000). `/` redirects to `/chat` when the session cookie is present, or to `/start/log-in` otherwise. The page and API validate the session on the server.

## Maintenance and Vercel

Maintenance is **on by default**: when `MAINTENANCE_MODE` is unset or has any value other than `off`, pages, auth actions, and API routes return the existing 503 maintenance response. Static Next.js assets remain accessible.

For Vercel, add `DEEPSEEK_API_KEY`, optionally set `DEEPSEEK_MODEL`, and retain the Upstash and AWS variables. Keep `MAINTENANCE_MODE` unset until ready to reopen production; set it to `off` to enable the app. Remove the unused Together AI / QStash variables. The package pins Node 24 (`engines.node: "24.x"`), which Vercel uses over the project setting.

## Conversation flow

The client sends only `{ id, message }` to `POST /api/chat`. The server authenticates the user, rate-limits that user (10 requests per 10 seconds), loads their stored conversation, and merges the incoming message by ID. Retrying a stored question truncates that question and later messages before appending it again.

The model sees at most the latest 24 messages / 24,000 text characters, starting on a user turn. Follow-up questions are rewritten using recent role messages before searching the Vector index. Retrieval keeps up to five documents with scores >=0.5. Only the latest user model message receives reference material; instructions and earlier history stay stable for DeepSeek prefix caching. Cache hits are best-effort, not guaranteed on every request. Stored messages remain raw, with source IDs and scores in assistant metadata.

History lives at `chat:{userId}:default` (one conversation per user), retains up to 200 messages, and expires 30 days after a save. Logging out and back in preserves it. Old session-keyed Redis history is not migrated and is orphaned. The provider stream is consumed independently; AI SDK 7's UI `onEnd` saves the completed or cancelled partial reply. The Stop button ends the client stream. `DELETE /api/chat` clears the authenticated user's history; clearing is disabled while a reply streams.

Development logs include condensed queries, retrieved source IDs/scores, and `promptCacheHitTokens`. Production does not log conversation text or provider metadata.

## Checks

Use Node 24 before running npm commands:

```bash
nvm use
npm run typecheck
npm run lint
npm test
npm run build
```

Vitest covers history merging/windowing, reference placement, query rewriting with the AI SDK mock model, retrieval filtering, storage retention, and API behavior.

Live verification requires configured services and a test login: ask about ibuprofen, follow up about its side effects and max daily dose, reload, stop a reply and reload, clear history, and log out/back in. Check Redis for unique message IDs and inspect the development cache logs. Check HTTP 401/403/429 responses and the default 503 gate.

## Data and follow-ups

Download label JSON from [openFDA](https://open.fda.gov/data/downloads/) and use [the dataset notebook](python/FDA-Dataset.ipynb) as a guide.

Follow-ups: migrate NextUI to HeroUI and review the unused `/api/auth` route. Lucia/DynamoDB auth is unchanged in this migration. Simultaneous conversations in multiple tabs still share the single default history; cross-tab write coordination is a follow-up. Evaluate drug-specific retrieval relevance: a correct rewritten query can still return labels for other drugs, in which case the assistant must acknowledge missing evidence.

## Screenshots

![Converse chat](https://github.com/user-attachments/assets/32685c04-8452-480f-ab1b-61a981193bf5)
![Converse UI](https://github.com/user-attachments/assets/295bd460-0b15-443f-a72c-de28ce9aa8a1)
