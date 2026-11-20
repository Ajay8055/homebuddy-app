# HomeBuddy

**One app. Every household. Everything organised.**

HomeBuddy is a shared household organiser for shopping lists, recurring bills and payments, chores, home maintenance and private personal expenses.

## Features

- Household overview dashboard
- Shared shopping list, bills, tasks and maintenance reminders
- Weekly, monthly and yearly recurring bills
- Family accounts with owner/member roles and a five-person household limit
- Private personal expenses visible only to their creator
- Live household updates through Supabase Realtime
- Mobile-first responsive interface
- Installable Progressive Web App (PWA) for iPhone and Android

## Install on your phone

**iPhone (iOS)**
1. Open the deployed HomeBuddy URL in Safari.
2. Tap Share.
3. Choose **Add to Home Screen**.
4. Keep **Open as Web App** enabled if shown, then tap Add.
5. Launch HomeBuddy from the new Home Screen icon.

**Android**
1. Open the deployed HomeBuddy URL in Chrome.
2. Open the browser menu and choose **Install app** or **Add to Home screen**.
3. Confirm the installation and launch HomeBuddy from the app icon.

Sign in with the same account on multiple devices to access the same household. Each family member should use their own account and join with the household invite code.

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

## Deploy to Vercel

Connect the GitHub repository `Ajay8055/homebuddy-app` to Vercel with:

- Framework preset: **Vite**
- Root directory: `./`
- Production branch: `main`
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`

Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the Production, Preview and Development environments. Redeploy after changing environment variables.

See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for Supabase configuration and launch checks.

## Launch safety

Never place a Supabase service-role key or secret key in frontend environment variables. Before inviting real users, complete the two-account household-sharing and unrelated-account isolation tests on both iOS and Android. Offline mode caches only the app shell and static assets; household data and Supabase actions require a network connection. Hosting and database free tiers have usage limits and are not unlimited.


## Notifications

HomeBuddy now includes a notification centre with per-user preferences, device push registration, in-app notification history, and a Supabase scheduled reminder worker.

- Device push uses the Web Push API and VAPID keys. Private VAPID and scheduler secrets are stored in Supabase Vault, not in the browser bundle.
- Supabase Edge Function: `homebuddy-push`.
- Supabase Cron invokes the worker every minute.
- Notification preferences, subscriptions and history are stored in `notification_preferences`, `notification_subscriptions` and `notifications`.
- Bill, task, event and maintenance reminders are generated server-side. Paid bills and completed tasks are checked again before delivery.
- Notification rows are user-scoped by RLS. Personal expenses are never included in shared notification payloads.
- Notification taps deep-link to the relevant HomeBuddy section and record where available.

For iPhone/iPad, install HomeBuddy using Safari → Share → Add to Home Screen, launch it from the Home Screen icon, and then enable notifications inside HomeBuddy. Push support requires a supported iOS/iPadOS version and an installed web app.
