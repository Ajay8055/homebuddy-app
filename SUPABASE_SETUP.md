# HomeBuddy Supabase setup

The HomeBuddy Supabase project is provisioned in the Mumbai region.

## Frontend configuration

Set these environment variables in Vercel:

- `VITE_SUPABASE_URL`: `https://tvprryuhxxwdirgtxssr.supabase.co`
- `VITE_SUPABASE_ANON_KEY`: use the Supabase **publishable** key (starts with `sb_publishable_`) shown in Project Settings → API Keys.

The React client expects the variable name `VITE_SUPABASE_ANON_KEY`; the value can be the modern publishable key. Never use a `service_role` or secret key in a browser app.

For local development, copy `.env.example` to `.env.local` and add the same two values. Keep `.env.local` out of Git.

## Authentication configuration

In Supabase Dashboard → Authentication → URL Configuration:

1. Set the production Site URL to `https://homebuddy-app-seven.vercel.app`.
2. Add the deployed URL and local development URL (for example `http://localhost:5173/**`) to the allowed Redirect URLs.
3. Review email confirmation and password-reset settings before inviting household members.

## Database migrations

The production project should have all repository migrations applied, including:
- Initial household schema and RLS
- Recurring bills and payments
- Family permissions and private personal expenses
- Household record ownership protection

The migration history was checked during the PWA implementation pass. Before applying future SQL changes, review the migration file and verify the production migration history first.

## First-use checks

1. Create a new account and confirm the email if confirmation is enabled.
2. Sign in and create a household.
3. Add a shopping item, bill, task and maintenance reminder.
4. Create a recurring bill and verify its next occurrence after marking it paid.
5. Create a second account and join the first household using its invite code.
6. Confirm both accounts see shared household records and changes sync across devices.
7. Confirm personal expenses are visible only to their creator.
8. Create an unrelated account and confirm it cannot read the first household's data.
9. Test install, navigation, sign-in and reconnect behaviour on iPhone Safari and Android Chrome.

## Deploy to Vercel

Connect the GitHub repository `Ajay8055/homebuddy-app` to Vercel:

- Framework preset: **Vite**
- Production branch: `main`
- Root directory: `./`
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`

Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to **Production**, **Preview** and **Development** environments. Trigger a new deployment after changing environment variables. The Vercel production domain must also be listed in Supabase Authentication URL Configuration.

## Free-tier note

The app does not require a paid AI API. Vercel and Supabase have free-tier usage limits and plan conditions; monitor usage and check current provider pricing before public launch. No unlimited-free hosting or database usage is guaranteed.


## Push notification infrastructure

The notification system has been provisioned in the production Supabase project:

- Tables: `notification_preferences`, `notification_subscriptions`, `notifications` (RLS enabled).
- Edge Function: `homebuddy-push` (scheduler requests are protected by a secret header; user test requests validate the signed-in Supabase user).
- Scheduler: `homebuddy-push-every-minute` using `pg_cron` + `pg_net`.
- VAPID public/private keys, VAPID subject and scheduler secret are stored in Supabase Vault. Do not add these values to Vercel or expose them in frontend code.
- No additional Vercel environment variables are required for push; the existing Supabase URL and publishable key are used.

To verify a device:
1. Sign in to HomeBuddy and open **Reminder centre**.
2. Choose **Enable notifications** and grant the browser permission.
3. Allow the app to register this browser/device and send the test push.
4. Confirm that the device appears as enabled and that the test notification arrives.
5. Change a notification category or quiet-hours setting and reload to confirm preferences persist.

To verify scheduled delivery, create a shared bill or task with a due date matching one of its reminder offsets. Keep a test device subscribed, wait for the scheduled time, and check the Notification Centre and Supabase Edge Function logs. Test paid/completed cancellation and two separate household accounts before public launch.

For iOS/iPadOS, install the PWA to the Home Screen from Safari and launch it from the installed icon before requesting notification permission. A normal Safari tab is not the installed web-app push experience.
