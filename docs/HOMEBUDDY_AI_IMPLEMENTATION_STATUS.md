# HomeBuddy AI implementation status

Last reviewed: 2026-11-22
Working branch: `feature/homebuddy-conversational-ai`
Base: `feature/native-android-expo` @ `88faa4c3729db664a09a223da3d15b251461ed15`

## Status legend
- [x] Verified complete (implementation and relevant tests/evidence checked)
- [~] In progress or partially present; not yet verified end-to-end
- [ ] Not implemented / not verified
- [!] Blocked by an external dependency or explicit approval

## Delivery checklist

| Task | Status | Implementation / evidence | Tests and actual result | Remaining work |
|---|---|---|---|---|
| Repository and architecture audit | [x] | Existing Vite/React web app in `src/App.jsx`; separate Expo/React Native app in `mobile/App.js`; Supabase Auth/Postgres/RLS/Realtime/Storage and Edge Functions; Playwright E2E tests. | Repository tree and key source/migration files inspected. | Complete schema, API, security, and native feature inventory. |
| Existing database and API audit | [x] | SQL migrations define household modules, roles, permissions, recurring records, documents, notifications, deletion flows. | Initial schema, permissions migration and account-delete Edge Function inspected. | Verify all table columns, RLS policies, RPCs, deployed function state and production schema. |
| AI provider integration | [~] | Deployed provider-neutral OpenAI-compatible Supabase Edge Function `homebuddy-ai` v1; server-only `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` configuration. | Function deployed ACTIVE; unauthenticated/authorized end-to-end inference not yet tested. | Configure AI_API_KEY server secret and run authenticated integration tests. |
| Conversational chat interface | [~] | Added HomeBuddy AI chat screen to web and native Expo apps; chat calls deployed Edge Function. | GitHub quality/native CI running; no live authenticated chat test yet. | Verify full conversation lifecycle and persist active thread selection across app restarts. |
| Natural-language intent engine | [~] | Server-side OpenAI-compatible function with typed tool definitions, Hindi/English/Hinglish system prompt and input validation. | Deployed function; live model test blocked by missing AI key. | Configure provider and add intent parser/action tests. |
| Reminder actions | [~] | AI create/list reminder tools use `household_tasks`; optional exact `due_at` column added. | Migration applied to live DB; actual AI write pending provider key. | Add edit/complete/cancel actions and verify reminder scheduler handles exact due times. |
| Shopping actions | [~] | AI add/list shopping tools integrated with existing table and RLS. | Live write pending provider key. | Add complete/remove/edit with confirmation for destructive actions. |
| Bill actions | [~] | AI add/list bill tools; clearly states bill creation does not pay a bill. | Live write pending provider key. | Add edit/status tools; require explicit confirmation before marking paid/deleting. |
| Task assignment actions | [~] | AI task tool resolves exact existing household member names through roster RPC and writes assigned_to. | Live write pending provider key; ambiguous/non-matching names return errors. | Add assignment/update/complete tests and ambiguity UX. |
| Expense actions | [~] | AI shared and private expense create tools write to separate existing tables; private rows scoped to auth.uid(). | Live write pending provider key. | Add personal-expense list tool and RLS integration tests. |
| Document Vault actions | [~] | AI can list document metadata only; does not claim to read file contents. | Live query pending provider key. | Add safe upload handoff and metadata search; preserve Storage RLS. |
| Maintenance actions | [~] | AI create/list maintenance reminder tools integrated with existing table. | Live write pending provider key. | Add asset lookup/link, edit and completion actions. |
| Voice commands | [~] | Web uses browser SpeechRecognition; native Android/iOS uses `expo-speech-recognition` with explicit mic/speech permissions and Hindi/English locale controls. | CI build pending; real-device recognition not tested. | Verify Hindi/English/Hinglish recognition on physical Android devices and permission denial handling. |
| Hindi and Hinglish support | [~] | Web/native speech locales hi-IN and en-IN; AI prompt supports Hindi, English and Hinglish. | Voice and live model integration not tested without provider key/device. | Validate Hinglish date, amount, family-name parsing with a test corpus. |
| Conversation persistence | [~] | Added RLS-protected ai_conversations, ai_messages, ai_action_requests and idempotency ledger; migrations applied to live Supabase. | Verified live schema, RLS enabled and 4/1/3 policies across tables. | Add conversation resume/history UI and integration tests. |
| Family context and permissions | [~] | Edge Function authenticates user and resolves one current household; queries execute using caller JWT so existing RLS applies; member assignment resolves against household roster. | Authenticated action test pending provider key; AI tables RLS verified live. | Add adversarial cross-household and private expense tests. |
| Notifications | [~] | Existing notification centre, notification schema, scheduler and push Edge Function described in repo. | Code/migration inventory present; end-to-end push not verified in this task. | Connect successful actions to existing notification mechanism; test web/native delivery. |
| Error handling | [~] | Function returns auth/config/provider/input errors; UI surfaces chat errors; provider timeouts bounded; duplicates are detected and ledgered. | Not yet tested end-to-end. | Add structured logging, retry tests and offline/timeout UX. |
| Duplicate prevention | [~] | Unique (user_id,idempotency_key) ledger; request ID metadata dedupe; duplicate bill/task detection prompts before adding. | Live constraints and RLS verified; action retry integration pending. | Test retries and multi-action same request. |
| Security testing | [~] | Existing RLS and role-specific migrations; account deletion Edge Function. | Partial source inspection only. | Test cross-user/household denial, prompt injection, tool allowlist, input validation and secret handling. |
| Automated integration testing | [~] | Added Playwright test for AI chat entry point; workflows updated to run web quality and Android CI on feature branch. | CI runs queued/in progress at last check. | Add authenticated Edge Function + DB integration tests. |
| Existing feature regression testing | [~] | Existing Playwright suite covers navigation, reminder, shopping, calendar, notifications and mobile menu. | Tests have not been run in this environment. | Run complete suite and fix regressions. |
| Android device testing | [ ] | Native Expo app and debug APK build workflow exist. | Native Gradle APK build passed; GitHub emulator boot smoke test failed because emulator device never appeared. | Test on a physical Android device; verify AI UI/actions/voice and notifications. |
| Production deployment | [ ] | Existing Vercel/Supabase deployment exists. | No AI changes deployed. | Deploy only after tests and security review; verify live APIs and UI. |
| Final Android APK generation | [~] | Native debug APK successfully built and uploaded in GitHub Actions run 45037077440. | Gradle build and artifact upload passed; emulator launch test failed. | Rebuild from final verified AI branch; physical-device test; produce signed release/AAB only with signing credentials. |

## Product behavior and safety requirements

- Natural-language chat and voice are primary interaction paths; existing module screens remain available for viewing/editing.
- Execute clear, low-risk create/update/list/complete requests immediately after validation.
- Ask a focused clarification when required fields or target records are ambiguous.
- Detect likely duplicates before creating records; use idempotency protection for retries.
- Confirm destructive actions and sensitive actions (e.g. deleting records, recording a payment as paid) before execution.
- Support edit/undo where safe and technically possible.
- Enforce household membership, member role and private/shared data boundaries on the server for every action.
- Persist conversation history with strict per-user/household RLS.
- Never expose provider secrets in browser/mobile bundles or logs.
- Never claim an action succeeded until the database write has succeeded and the resulting record has been verified.

## External dependencies / blockers

- [!] Live AI model execution requires an AI provider API key stored as a server-side secret (not in Vite/Expo public env). Implement provider-neutral server-side integration first; request the key only when ready to configure live inference.
- [!] Voice transcription may require a provider credential depending on selected implementation. First assess native/device speech support and implement graceful text fallback.
- [!] Signed Play Store release requires Android signing/Play Console credentials. Debug APK testing does not require these.
- [!] Physical Android device acceptance cannot be completed by hosted CI; user must install and exercise the build on a device when the candidate APK is ready.

## Change log

- 2026-11-22: Applied AI conversation/action-ledger migrations to live Supabase; verified RLS enabled and policy counts (4 conversation, 1 message, 3 action-ledger policies); applied optional task due_at migration. Deployed `homebuddy-ai` Edge Function v1 (ACTIVE). Added web and native chat UIs, browser speech input, native SDK 54 Hindi/English speech recognition, and initial Playwright UI test. CI execution is pending.

- 2026-11-22: Created dedicated feature branch from native Android work. Started repository/schema/API audit. Confirmed no AI provider, conversational action engine, or AI chat UI in the inspected web/native app source.
