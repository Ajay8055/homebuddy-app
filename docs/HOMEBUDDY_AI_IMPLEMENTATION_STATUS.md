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
| Repository and architecture audit | [~] | Existing Vite/React web app in `src/App.jsx`; separate Expo/React Native app in `mobile/App.js`; Supabase Auth/Postgres/RLS/Realtime/Storage and Edge Functions; Playwright E2E tests. | Repository tree and key source/migration files inspected. | Complete schema, API, security, and native feature inventory. |
| Existing database and API audit | [~] | SQL migrations define household modules, roles, permissions, recurring records, documents, notifications, deletion flows. | Initial schema, permissions migration and account-delete Edge Function inspected. | Verify all table columns, RLS policies, RPCs, deployed function state and production schema. |
| AI provider integration | [ ] | No AI provider integration identified in inspected package/source. | Not yet implemented. | Implement server-side provider abstraction and strict tool/action validation. AI provider secret/key required before live model calls. |
| Conversational chat interface | [ ] | Existing app currently uses module navigation and forms. | Not yet implemented. | Build chat-first UI while retaining all existing modules. |
| Natural-language intent engine | [ ] | No intent/action engine identified in inspected source. | Not yet implemented. | Parse Hindi/English/Hinglish into typed, validated intents; ask for missing fields. |
| Reminder actions | [ ] | Existing task/reminder data uses `household_tasks`; reminder centre currently maps to tasks. | Existing Playwright reminder coverage exists; AI action path not tested. | Add safe create/update/complete/search actions with correct date/time and recurrence. |
| Shopping actions | [ ] | Existing `shopping_items` table and UI. | Existing Playwright quick-add test; AI action path not tested. | Add natural-language add/update/complete/remove/list actions. |
| Bill actions | [ ] | Existing `bills` table, recurring bill support and UI. | Existing feature tests; AI action path not tested. | Add bill creation/update/status/list; payment/deletion require explicit confirmation. |
| Task assignment actions | [ ] | Existing `household_tasks`, assignee membership validation and UI. | Existing task tests; AI action path not tested. | Resolve family member names safely and enforce membership/role policies. |
| Expense actions | [ ] | Existing `shared_expenses` and `personal_expenses`. | Existing app implementation; AI action path not tested. | Keep private/shared distinction and enforce user ownership. |
| Document Vault actions | [ ] | Existing `household_documents` and Storage-backed vault. | UI exists; AI document action path not tested. | Support search/metadata and upload handoff; never fabricate file contents or bypass Storage/RLS. |
| Maintenance actions | [ ] | Existing `maintenance_reminders` and `home_assets`. | Existing app implementation; AI action path not tested. | Add create/update/list/complete actions and asset linking. |
| Voice commands | [ ] | No verified voice capture/transcription path identified yet. | Not tested. | Add speech capture and transcript confirmation; select provider/platform capability after architecture review. |
| Hindi and Hinglish support | [ ] | User requires Hindi, English and Hinglish text/voice. | Not tested. | Add multilingual parsing, date/amount normalization and user-facing confirmations. |
| Conversation persistence | [ ] | No conversation tables identified in initial tree. | Not tested. | Add RLS-protected conversation/message persistence with retention-safe schema. |
| Family context and permissions | [~] | Existing household membership/roles/RLS and assignee validation. | Relevant migrations inspected; AI authorization path absent. | Re-check membership server-side for every action; private expense isolation; no cross-household context leakage. |
| Notifications | [~] | Existing notification centre, notification schema, scheduler and push Edge Function described in repo. | Code/migration inventory present; end-to-end push not verified in this task. | Connect successful actions to existing notification mechanism; test web/native delivery. |
| Error handling | [~] | Existing UI surfaces Supabase errors in many forms. | Not comprehensively tested. | Add typed action errors, retry safety, user-friendly clarification and provider timeout handling. |
| Duplicate prevention | [ ] | No AI idempotency/action ledger identified. | Not tested. | Add idempotency keys and duplicate-intent checks; avoid repeated inserts on retries. |
| Security testing | [~] | Existing RLS and role-specific migrations; account deletion Edge Function. | Partial source inspection only. | Test cross-user/household denial, prompt injection, tool allowlist, input validation and secret handling. |
| Automated integration testing | [~] | Playwright tests exist for web UI. | Existing test files inspected; no conversational action integration tests. | Add parser, action API, RLS and end-to-end tests. |
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

- 2026-11-22: Created dedicated feature branch from native Android work. Started repository/schema/API audit. Confirmed no AI provider, conversational action engine, or AI chat UI in the inspected web/native app source.
