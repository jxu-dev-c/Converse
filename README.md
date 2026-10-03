# Converse

Converse is a research chatbot over openFDA OTC drug labels. It retrieves reference material from Upstash Vector and streams answers from DeepSeek through AI SDK 7. It is for research only, not medical advice.

## Stack

- Next.js 16 (App Router, Turbopack, `proxy.ts`), React 19, Node 24
- AI SDK 7, `@ai-sdk/react` 4, `@ai-sdk/deepseek` 3
- DeepSeek `deepseek-v4-flash`, with thinking enabled (high effort) and model-controlled search
- Upstash Vector with hosted embeddings, Redis history, and per-user rate limits
- Lucia / AWS DynamoDB authentication with Resend verification and password recovery
- NextUI, Tailwind CSS, and sanitized Markdown rendering with marked / DOMPurify

## Local setup

```bash
source ~/.nvm/nvm.sh
nvm install 24
nvm use
npm install
cp .env.example .env.local
```

Fill in `.env.local` with a DeepSeek API key, the existing Upstash credentials, the existing AWS / DynamoDB auth settings, and `RESEND_API_KEY` / `EMAIL_FROM` for auth emails. The Vector index must contain OTC label text as `data` and support hosted embeddings. Auth also expects the existing `converse-sessions` table and `lucia-sessions-user-index` index. `.env.local` is gitignored; never commit credentials.

`DEEPSEEK_MODEL` is optional and defaults to `deepseek-v4-flash`. Set `OPENROUTER_API_KEY` for the Jev input guardrail; optional `JEV_MODEL` defaults to `jev-1.13`. `TOGETHER_AI_API_KEY` and `QSTASH_TOKEN` are no longer used. See [.env.example](.env.example) for all variable names.

`AI_WEEKLY_COST_CAP_USD` defaults to `1` ($1 per authenticated user per calendar week) and accepts a nonnegative USD amount. `0` blocks paid AI calls. Weeks reset Monday at 00:00 UTC. The cap is shared across all of a user's chats, including edits/regenerations, Jev audits (even refusals), every DeepSeek tool round, and generated titles. Existing history, resume, Stop, rename and deletion remain available after the cap is reached. Accounting starts when this feature is deployed; earlier calls are not backfilled.

Click the profile portrait to see a weekly AI budget meter with estimated usage, remaining allowance and the reset date. The menu loads the signed-in user's budget from `GET /api/ai-budget` and refreshes every 10 seconds while open; it makes no requests while closed. This endpoint uses the existing authentication, origin and rate-limit guards, returns `Cache-Control: private, no-store`, and remains readable after the budget is exhausted or paid calls are disabled. Usage includes reservations for active requests. If accounting is unavailable, the menu shows an unavailable message and keeps Sign Out accessible.

Costs use [TokenLens](https://github.com/xn1cklas/tokenlens) (`@tokenlens/helpers`) for DeepSeek, counting cached input separately and reasoning within the output total. Default Flash and V4 Pro prices use conservative **peak** rates from [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/) verified on 2026-10-02; off-peak calls can therefore consume budget faster than their invoice cost. Override `DEEPSEEK_INPUT_USD_PER_MILLION`, `DEEPSEEK_CACHED_INPUT_USD_PER_MILLION`, and `DEEPSEEK_OUTPUT_USD_PER_MILLION` for changed prices or a different model. Unrecognized DeepSeek models require all three rates and otherwise block generation. Jev uses OpenRouter's reported `usage.cost`; its pre-call reservation is `$0.002`, configurable via `JEV_REQUEST_RESERVE_USD` for more expensive models. Defaults cover the current Jev 1.13 price/context limit. Prices and reservation bounds must be kept current with the providers.

Redis Lua atomically reserves each call's conservative maximum against a user/week key (`converse:ai-budget:{userId}:{weekStartMs}`), then reconciles confirmed usage before the next tool round. DeepSeek reservations use UTF-8 prompt/tool bytes plus template padding and the output token limit. Calls are rejected if the maximum cannot fit the remaining allowance, so the last small balance may be unusable. Missing usage, failed calls, cancellation and process crashes retain the maximum reservation until the weekly reset; automatic DeepSeek retries are disabled. Redis/configuration errors block paid calls. Settlements keep their original week across a reset and are idempotent. Budget keys expire one week after their reset. Chat deletion does not erase costs.

Set `MAINTENANCE_MODE=off` locally, then:

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000). `/` redirects to `/chat` when the session cookie is present, or to `/start/log-in` otherwise. The page and API validate the session on the server.

## Authentication

Sign-up always shows “Check your inbox”, including when the address already has an account. New users receive a verification link; existing users receive an email with login and password reset links. New accounts get a session only after email confirmation. Login failures use the same “Incorrect email or password” message for an unknown email and a wrong password. A correct password on an unverified account resends a verification link.

`/start/forgot-password` always returns “If an account exists, we sent a link”. Reset links expire after 30 minutes; verification links expire after 24 hours. Opening either link only checks it. A button submission consumes its hashed Redis token atomically, so mail link scanners do not use up the token. Resetting a password also verifies the email, invalidates all previous sessions, and creates a fresh session. Legacy users without `emailVerified` continue to count as verified.

Auth email requests are limited before account lookup: reset requests allow 3 per email and 10 per IP per 15 minutes; sign-up allows 5 per IP; verification/account-exists emails allow 3 per email. Password rules are shared by the server and forms, and each password hash gets a fresh bcrypt salt.

Configure the Resend sending domain `converse.signature-estate.online` using its DNS records in Cloudflare with DNS-only mode, then verify it in Resend. Use a domain-scoped sending key for `RESEND_API_KEY` and `EMAIL_FROM="Converse <no-reply@converse.signature-estate.online>"` locally and in all Vercel environments. Never run `vercel env pull` over the local env file. Optional `APP_URL` sets the trusted origin for email links; otherwise production uses `VERCEL_PROJECT_PRODUCTION_URL`, then `VERCEL_URL`, then `http://localhost:3000`. No request Host header is used. Set `APP_URL=http://localhost:3000` for local email testing if the local env file includes a Vercel URL.

## Maintenance and Vercel

Maintenance is **on by default**: when `MAINTENANCE_MODE` is unset or has any value other than `off`, pages, auth actions, and API routes return the existing 503 maintenance response. Static Next.js assets remain accessible.

For Vercel, add `DEEPSEEK_API_KEY` and `OPENROUTER_API_KEY`, optionally set `DEEPSEEK_MODEL` / `JEV_MODEL`, add `RESEND_API_KEY` and `EMAIL_FROM` to Production, Preview, and Development, and retain the Upstash and AWS variables. `OPENROUTER_API_KEY` is currently configured only in Production; Preview fails open with a `missing_key` warning. Keep `MAINTENANCE_MODE` unset until ready to reopen production; set it to `off` to enable the app. Remove the unused Together AI / QStash variables. The package pins Node 24 (`engines.node: "24.x"`), which Vercel uses over the project setting.

## Conversation flow

The client sends only `{ id, message }` to `POST /api/chat`. The server authenticates the user, rate-limits that user (10 requests per 10 seconds), checks their weekly AI budget before any audit, loads their stored conversation, and merges the incoming message by ID. Exhausted budgets return HTTP 429 with `Retry-After` until the next reset; unavailable budgets return 503. A budget denial during an agent loop produces a streamed error and persists completed work. Retrying a stored question truncates that question and later messages before appending it again.

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

Vitest covers auth token hashing/expiry/single use, generic auth responses, verification, password reset validation/session invalidation, and history merging/windowing including tool evidence, model-controlled search with the AI SDK mock model, retrieval filtering and failures, persisted tool validation, search round limits, storage retention, and API behavior.

Weekly budget tests cover provider accounting, env validation, reset boundaries, budget errors and stopping the paid tool loop. To additionally run the Lua scripts against a real local Redis, set `TEST_REDIS_SERVER` and `TEST_REDIS_CLI` to the executable paths and run `npm test`. Those tests start an isolated Redis on a temporary Unix socket with persistence disabled and verify concurrent reservations, idempotent settlement and rollover; they never use the application's Redis credentials.

Live verification uses the existing test login with `MAINTENANCE_MODE=off`. Back up its Redis state first and restore it afterward. Check legacy history, citations and ref reuse, reasoning, reload/second-tab resume, Stop persistence, concurrent chats, edit/regenerate/copy, rename/delete, composer and scroll behavior. Repeat at desktop and 375px widths in both themes. Inspect Redis and dev logs; verify HTTP 401/403/429 and the default 503 gate.

## Data and follow-ups

Download label JSON from [openFDA](https://open.fda.gov/data/downloads/) and use [the dataset notebook](python/FDA-Dataset.ipynb) as a guide.

Follow-ups: migrate NextUI to HeroUI and migrate the existing Lucia integration. Evaluate drug-specific retrieval relevance: a focused tool query can still return labels for other drugs, in which case the assistant must acknowledge missing evidence.

## Screenshots

![Converse chat](https://github.com/user-attachments/assets/32685c04-8452-480f-ab1b-61a981193bf5)
![Converse UI](https://github.com/user-attachments/assets/295bd460-0b15-443f-a72c-de28ce9aa8a1)
