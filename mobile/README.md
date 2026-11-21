# HomeBuddy Native Android

A native React Native + Expo Android client. It is not a WebView, PWA shortcut, or Trusted Web Activity. The existing Vite PWA remains available and the production Supabase backend is reused.

## Stack
- Expo SDK 54 / React Native 0.81
- Supabase Auth, PostgreSQL, RLS, Realtime and Storage
- AsyncStorage for auth persistence and a basic household data cache
- Expo Document Picker, FileSystem, Sharing and Notifications

## Local setup
1. Install Node.js 22 LTS and Android Studio with Android SDK 36.
2. From `mobile/`, run `npm install`.
3. Copy `.env.example` to `.env` and set the existing Supabase URL and anon/publishable key. Never use a service-role key in a mobile app.
4. Run `npx expo run:android` with an emulator or Android device connected.

## Enable remote Android push
1. Run `eas login` and `eas init` from `mobile/` using the app owner's Expo account.
2. Set `EXPO_PUBLIC_EAS_PROJECT_ID` to the EAS project ID in the local `.env` and the EAS build environment.
3. In Firebase Console, register Android package `com.homebuddy.app` and configure Firebase Cloud Messaging HTTP v1.
4. Upload the Firebase service-account JSON as the Android FCM v1 credential in Expo/EAS credentials. Never commit the service-account JSON or private key.
5. Build/install a new Android binary, grant notification permission, and use **Family & settings → Enable push notifications → Send test notification**.

Without the EAS project and FCM credential, the app continues to use local scheduled reminders; native remote push registration is intentionally blocked rather than silently pretending it is enabled.

## Implemented in this migration branch
- Native email/password sign-in and account creation.
- Household creation and invite-code joining using existing RPCs.
- Household overview, member roster and invite-code display.
- Native list, create, edit and delete flows for shopping, bills, tasks, maintenance, calendar events, home assets, shared expenses and personal expenses.
- Mark bill paid and shopping/task completed.
- Document vault: native file picker, 10 MB limit, allowed MIME types, upload to existing private `homebuddy-documents` bucket, metadata row, signed-URL download/share and delete.
- Local notification permission/channel and scheduled local reminders for due bills, tasks, maintenance and events. These are device-local notifications; remote push delivery to family members is not yet implemented.
- Basic cached household records for read fallback during network errors.
- Persistent offline create/update/delete queue with optimistic local list updates, automatic replay when connectivity returns, conflict detection against server snapshots and explicit keep-server/overwrite resolution.
- Native account deletion wired to the existing authenticated Edge Function, plus owner household deletion with private document object cleanup.
- Realtime refresh for selected shared tables.
- Native Android CI workflow that builds and uploads a debug APK.

## Still required before production / Play Store
- Full native family/household settings parity: owner transfer, archive/claim, remove member, delete household/account with confirmations.
- Validate all RPC names/parameters and every table column against the production schema, especially household creation/joining.
- Robust offline write queue, conflict resolution and cache invalidation.
- Remote push delivery, device token registration, notification preferences and background scheduling reliability tests.
- Native automated tests, accessibility, deep links, Android back navigation, device/OS matrix testing.
- Signed release AAB, Play Console listing, privacy/data safety declarations and release validation.

Do not publish the current debug build as a finished consumer app. No production schema migration is included in this native client milestone.
