# HomeBuddy AI setup

The conversational assistant is deployed as the Supabase Edge Function `homebuddy-ai`. The provider key is read only by the Edge Function; it must never be exposed in web or Android client configuration.

## Required server secret

Configure `AI_API_KEY` in the Supabase project's Edge Function secrets.

- Default provider endpoint: `https://api.openai.com/v1`
- Default model: `gpt-4o-mini`

Optional secrets for an OpenAI-compatible provider:

- `AI_BASE_URL`: provider's API base URL, without a trailing slash
- `AI_MODEL`: model identifier supported by that provider

Do not add these values to `.env`, `.env.local`, `VITE_*`, `EXPO_PUBLIC_*`, source control, or client-side app configuration.

## Configure in Supabase

1. Open the HomeBuddy project in the Supabase dashboard.
2. Open Edge Functions secrets (under Project Settings / Edge Functions, depending on dashboard navigation).
3. Add `AI_API_KEY` with your provider API key.
4. Optionally add `AI_BASE_URL` and `AI_MODEL` if using a compatible provider other than the default.
5. Do not paste the secret into chat, GitHub issues, or source files.

The deployed function reads secrets at request time; a redeploy is not normally required after setting secrets.

## Current supported assistant actions

- Add, update, complete and list shopping items.
- Create, update, complete and list reminders/tasks, including optional date, exact time and family-member assignment.
- Assign a task to an exact existing household member name.
- Create, update and list bills; bill creation never transfers money.
- Mark a uniquely matched bill as paid only after a separate confirmation turn; recurring bills create their next due record, and no money is transferred.
- Record and update shared and private expenses in separate tables.
- Create and update maintenance reminders, optionally linked to an existing home asset.
- Update family calendar events and home assets.
- Create and list family calendar events.
- Add and list home assets.
- Complete a uniquely matched pending task or shopping item; recurring tasks create their next due occurrence.
- Upload, list and confirmation-delete documents directly through chat using the existing private Document Vault and Storage policies; file contents are not read by the assistant.
- Delete a uniquely matched supported record only after a separate confirmation turn; database RLS and role policies still apply.
- Update bills, reminders/tasks, shopping items, expenses, maintenance reminders, home assets and family events.

The assistant does not initiate payments, transfer household ownership, change family membership, or inspect document contents.

## Verification still required

After setting the secret, run authenticated end-to-end tests with two separate household accounts. Verify creation, completion, confirmation-gated payment/deletion, duplicate prevention, private-expense isolation, cross-household denial, Hindi/Hinglish date parsing, and notification delivery. Test voice recognition on a physical Android device with Hindi and English speech permissions granted and denied.
