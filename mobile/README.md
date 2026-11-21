# HomeBuddy Native Android

This is the native React Native / Expo Android client. It is **not** a WebView, PWA shortcut, or Trusted Web Activity. The existing Vite PWA remains available for web users.

## Backend

The native app reuses the existing Supabase project, authentication, PostgreSQL schema, RLS policies, Storage and Edge Functions. No production database migration is required for the initial native client.

## Local setup

1. Install Node.js LTS and Android Studio with an Android SDK.
2. From this directory run `npm install`.
3. Copy `.env.example` to `.env` and set the existing Supabase project URL and anon/publishable key. Never use a service-role key in the mobile app.
4. Run `npx expo run:android` with an Android emulator/device connected.

## Current migration milestone

- Native React Native application shell and Android application ID `com.homebuddy.app`.
- Supabase email/password sign-in and account creation.
- Existing household membership lookup and read-only dashboard counts.
- The web app and production database are untouched.

## Remaining before a Play Store release

- Migrate full create/read/update/delete workflows for every section (shopping, bills, tasks, calendar, maintenance, assets, expenses, documents, family and household settings).
- Native push notifications and scheduled local reminders; configure Expo/EAS credentials and replace the web-push subscription flow.
- Household creation and invite-code joining screens.
- Native document picker, camera/file upload, downloads and sharing.
- Offline cache and conflict-safe sync.
- Deep links, Android back behavior, accessibility and responsive device testing.
- Automated unit/component/E2E tests, signed AAB, Play Console setup and verified Digital Asset Links only if the legacy TWA is retained.

Do not publish this initial milestone as a finished consumer app. It is a native foundation for phased feature parity.
