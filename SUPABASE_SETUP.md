# HomeBuddy Supabase setup

The HomeBuddy Supabase project has already been created in the Mumbai region. The database schema is provisioned by the repository migration at `supabase/migrations/0001_initial_schema.sql`.

## Frontend configuration

Set these environment variables in your hosting provider's build settings:

- `VITE_SUPABASE_URL`: `https://tvprryuhxxwdirgtxssr.supabase.co`
- `VITE_SUPABASE_ANON_KEY`: use the Supabase **publishable** key (starts with `sb_publishable_`) shown in the project API keys settings.

The current React client expects the variable name `VITE_SUPABASE_ANON_KEY`; the value can be the modern publishable key. Never use a `service_role` or secret key in a browser app.

For local development, copy `.env.example` to `.env.local` and add the same two values. Keep `.env.local` out of Git.

## Authentication configuration

In Supabase Dashboard → Authentication → URL Configuration:

1. Set the production Site URL to the deployed HomeBuddy URL.
2. Add the deployed URL and local development URL (for example `http://localhost:5173/**`) to the allowed Redirect URLs.
3. Review email confirmation and password-reset settings before inviting household members.

## First-use checks

1. Create a new account and confirm the email if confirmation is enabled.
2. Sign in and create a household.
3. Add a shopping item, bill, task and maintenance reminder.
4. Create a second account and join the first household using its invite code.
5. Confirm both accounts can see the shared household records.
6. Create a third unrelated account and confirm it cannot read the first household's data.

The database uses RLS on all six public tables. Household creation/joining is performed through authenticated RPCs; the privileged implementation functions live in the non-exposed `private` schema. Supabase's security advisor should be checked after schema changes.

## Cloudflare Pages deployment

Connect the GitHub repository `Ajay8055/homebuddy-app` using Cloudflare Pages → Create application → Pages → Connect to Git.

Use:
- Framework preset: **Vite**
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`

Add the two frontend environment variables above to both Production and Preview environments before the first real-user test. Cloudflare Pages Git integration automatically builds and deploys new commits pushed to the production branch.

## Free-tier note

HomeBuddy's app code and initial database setup do not require a paid AI API. Cloudflare Pages and Supabase offer free tiers with usage limits and plan conditions; monitor usage and check current provider pricing before public launch. No unlimited-free hosting or database usage is guaranteed.
