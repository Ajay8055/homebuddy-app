# HomeBuddy

**One app. Every household. Everything organised.**

HomeBuddy is a responsive household organiser for shopping lists, household bills, chores and home maintenance.

## Features

- Household overview dashboard
- Shopping list with quantities and completion tracking
- Bills with due dates, amounts and paid status
- Household chores and maintenance reminders
- Quick-add helper using local keyword rules
- Supabase email/password authentication and household sharing
- Row Level Security policies for household data
- Mobile-responsive PWA foundation

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add the Supabase values from [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) to `.env.local` to use real accounts and shared household data. Leave them blank to use local demo mode; demo data is saved in this browser only. Keep `.env.local` out of Git.

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

See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for the provisioned project, auth configuration and launch checklist.

## Launch safety

Never place a Supabase service-role key in frontend environment variables. Before inviting real users, complete the two-account household-sharing and unrelated-account isolation tests. Cloudflare Pages and Supabase free tiers have usage limits; this project does not guarantee unlimited-free hosting or database usage.
