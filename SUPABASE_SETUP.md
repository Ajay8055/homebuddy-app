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
