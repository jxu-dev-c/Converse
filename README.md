# Converse

Converse is a research chatbot over openFDA OTC drug labels. It retrieves reference material from Upstash Vector and streams answers from DeepSeek through AI SDK 7. It is for research only, not medical advice.

## Stack

- Next.js 16 (App Router, Turbopack, `proxy.ts`), React 19, Node 24
- AI SDK 7, `@ai-sdk/react` 4, `@ai-sdk/deepseek` 3
- DeepSeek `deepseek-v4-flash`, with thinking enabled (high effort) and model-controlled search
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

`DEEPSEEK_MODEL` is optional and defaults to `deepseek-v4-flash`. Set `OPENROUTER_API_KEY` for the Jev input guardrail; optional `JEV_MODEL` defaults to `jev-1.13`. `TOGETHER_AI_API_KEY` and `QSTASH_TOKEN` are no longer used. See [.env.example](.env.example) for all variable names.

Set `MAINTENANCE_MODE=off` locally, then:

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000). `/` redirects to `/chat` when the session cookie is present, or to `/start/log-in` otherwise. The page and API validate the session on the server.

## Maintenance and Vercel

Maintenance is **on by default**: when `MAINTENANCE_MODE` is unset or has any value other than `off`, pages, auth actions, and API routes return the existing 503 maintenance response. Static Next.js assets remain accessible.

For Vercel, add `DEEPSEEK_API_KEY` and `OPENROUTER_API_KEY`, optionally set `DEEPSEEK_MODEL` / `JEV_MODEL`, and retain the Upstash and AWS variables. `OPENROUTER_API_KEY` is currently configured only in Production; Preview fails open with a `missing_key` warning. Keep `MAINTENANCE_MODE` unset until ready to reopen production; set it to `off` to enable the app. Remove the unused Together AI / QStash variables. The package pins Node 24 (`engines.node: "24.x"`), which Vercel uses over the project setting.

## Conversation flow

The client sends only `{ id, message }` to `POST /api/chat`. The server authenticates the user, rate-limits that user (10 requests per 10 seconds), loads their stored conversation, and merges the incoming message by ID. Retrying a stored question truncates that question and later messages before appending it again.

Guardrail: before storing the incoming message or sending it to DeepSeek (including title generation), Jev audits it through [OpenRouter's System One API](https://openrouter.ai/docs/guides/community/typesafe-sdk). Medical questions and small talk pass. The last user/assistant text provides bounded context for follow-ups; tool outputs are excluded. An `off_topic` probability >=0.5 returns a fixed streamed refusal, and neither the question nor refusal is persisted. Missing credentials, HTTP errors, timeouts (3 seconds, no retries), and invalid responses fail open with reason-only warnings that contain no message text or credentials.

The model sees a window starting on a user turn, bounded to 40 messages and approximately 12,000 tokens. Reasoning is persisted for display and removed from outgoing history. Tool evidence older than the latest three user turns is pruned. The agent receives its request registry through typed call options and `prepareCall`, which sets tool context (the installed SDK does not accept `toolsContext` directly in `.stream()`). The module-level agent has thinking enabled at high effort, a 4096-token output budget, and reserves step four for an answer after at most three searches.

Search uses hosted Upstash Vector embeddings, retaining up to five excerpts with scores >=0.5. Each label receives a stable conversation citation number and an optional drug/manufacturer title. Drug claims cite `[n]` anchors from tool results. The UI sanitizes Markdown, renders citation chips with excerpt tooltips, and lists sources. Legacy PR #9 `{ docs, sources, error? }` outputs remain valid and renderable. Reasoning and searches share a collapsible activity block.

`/chat` starts a conversation and `/chat/{id}` loads it. Redis stores user-scoped `chat:{userId}:{chatId}` messages, a `:meta` hash, and a `chats:{userId}` sorted index capped at 100 conversations. Saves refresh 30-day message/meta TTLs. Existing `default` history is backfilled into the sidebar. Titles are generated with thinking disabled; chats support rename and confirmed deletion. Active chats cannot be deleted.

Streams use `resumable-stream/generic` with Upstash Redis REST SSE using the existing credentials. Pub/sub payloads are base64 encoded to preserve newlines through REST SSE and UI deltas are batched every 50ms. Reloads and second tabs attach through `GET /api/chat/{id}/stream`. Disconnects do not stop generation. `POST /api/chat/{id}/stop` accepts no body, publishes a server-side cancellation signal, and waits for partial output persistence. Redis Lua atomically claims a producer and only allows the active stream to save, so older streams cannot overwrite newer turns. Stopping must finish before a replacement producer starts. Incomplete tool calls are omitted during model conversion.

The composer supports Enter, Shift+Enter, IME input and 3000 characters. Message actions copy Markdown, edit user turns, or regenerate the latest answer. Editing drops subsequent turns. Scroll up to pause following, then use Jump to latest. The sidebar becomes a drawer on mobile.

Development logs include tool search queries, retrieved source IDs/scores, and `promptCacheHitTokens`. Production does not log conversation text or provider metadata.

## Checks

Use Node 24 before running npm commands:

```bash
nvm use
npm run typecheck
npm run lint
npm test
npm run build
```

Vitest covers history merging/windowing including tool evidence, model-controlled search with the AI SDK mock model, retrieval filtering and failures, persisted tool validation, search round limits, storage retention, and API behavior.

Live verification uses the existing test login with `MAINTENANCE_MODE=off`. Back up its Redis state first and restore it afterward. Check legacy history, citations and ref reuse, reasoning, reload/second-tab resume, Stop persistence, concurrent chats, edit/regenerate/copy, rename/delete, composer and scroll behavior. Repeat at desktop and 375px widths in both themes. Inspect Redis and dev logs; verify HTTP 401/403/429 and the default 503 gate.

## Data and follow-ups

Download label JSON from [openFDA](https://open.fda.gov/data/downloads/) and use [the dataset notebook](python/FDA-Dataset.ipynb) as a guide.

Follow-ups: migrate NextUI to HeroUI and review the unused `/api/auth` route. Lucia/DynamoDB auth is unchanged. Evaluate drug-specific retrieval relevance: a focused tool query can still return labels for other drugs, in which case the assistant must acknowledge missing evidence.

## Screenshots

![Converse chat](https://github.com/user-attachments/assets/32685c04-8452-480f-ab1b-61a981193bf5)
![Converse UI](https://github.com/user-attachments/assets/295bd460-0b15-443f-a72c-de28ce9aa8a1)
