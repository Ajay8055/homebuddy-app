# HomeBuddy

**One app. Every household. Everything organised.**

HomeBuddy is a responsive household organiser for shopping lists, household bills, chores and home maintenance.

## Features

- Household overview dashboard
- Shopping list with quantities and completion tracking
- Bills with due dates, amounts and paid status
- Household chores and maintenance reminders
- Quick-add helper using local keyword rules
- Supabase email/password authentication and household sharing (when configured)
- Row Level Security policies in the included Supabase migration
- Mobile-responsive PWA foundation

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Leave the Supabase values blank to use local demo mode. Demo data is saved in this browser only. To enable real accounts and household sync, follow [SUPABASE_SETUP.md](./SUPABASE_SETUP.md).

## Build

```bash
npm run build
npm run preview
```

## Deploy to Cloudflare Pages

- Framework preset: Vite
- Build command: `npm run build`
- Build output directory: `dist`
- Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables for production and preview builds.

## Important launch notes

The app is not ready for a public multi-user launch until a Supabase project has been provisioned, the SQL migration has been run, environment variables and auth redirect URLs have been configured, and two-account household-isolation tests have passed. Never place a Supabase service-role key in frontend environment variables. See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md).
