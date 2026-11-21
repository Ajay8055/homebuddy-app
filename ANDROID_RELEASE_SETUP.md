# HomeBuddy Android / Google Play release

## Package
- Android application ID: `com.homebuddy.app` (keep this unchanged after first Play upload)
- Display name: HomeBuddy
- Website / TWA origin: `https://homebuddy-app-seven.vercel.app/`
- Android target SDK: 36
- Android minimum SDK: 23
- Version: 1.0.0 (versionCode 1)
- Package type: Trusted Web Activity (TWA), so the existing PWA, Supabase sign-in, household sync and web push implementation remain the product runtime.

## Build a debug APK
Run the GitHub Actions workflow **HomeBuddy Android package** manually. Download artifact `homebuddy-android-debug-apk` and install the APK on a test Android phone. Debug builds use package `com.homebuddy.app.debug` and are for testing only.

## Configure Play Store signing
The upload keystore is generated for this app. Keep `homebuddy-upload-key.jks` and its password in a secure password manager and offline backup. Never commit the keystore or password to GitHub.

In GitHub repository Settings → Secrets and variables → Actions, create:
- `ANDROID_KEYSTORE_BASE64`: Base64 contents of the JKS file (command: `base64 -w0 homebuddy-upload-key.jks`)
- `ANDROID_KEYSTORE_PASSWORD`: keystore password
- `ANDROID_KEY_ALIAS`: `homebuddy-upload`
- `ANDROID_KEY_PASSWORD`: key password (same as keystore password for this generated key)

Then run the **HomeBuddy Android package** workflow. It will produce `homebuddy-play-store-aab` (`app-release.aab`) signed with the upload key.

## Google Play Console steps
1. Create the HomeBuddy app in Play Console and use package ID `com.homebuddy.app`.
2. Complete Play App Signing enrollment. Upload the signed AAB from GitHub Actions.
3. In Play Console → App integrity, copy the **App signing key certificate SHA-256** fingerprint (not just the upload certificate fingerprint).
4. Add that fingerprint to `public/.well-known/assetlinks.json` alongside the upload fingerprint and deploy the website. This is required for full-screen verified TWA launches from Play-installed builds.
5. Confirm the file is publicly served at `https://homebuddy-app-seven.vercel.app/.well-known/assetlinks.json` with HTTP 200 and `application/json`.
6. Complete store listing, screenshots, privacy policy URL, Data safety form, content rating, app access instructions, target audience, ads declaration and testing tracks.
7. Test Play internal testing on real Android devices, including login, notifications, file upload, external links, back navigation and offline/reconnect before production rollout.

## Important release notes
- The upload certificate fingerprint is already in the asset links file for direct testing APKs signed with the upload key. Google Play re-signs delivered APKs with the Play app-signing key; add that second fingerprint after Play App Signing enrollment.
- A TWA requires Chrome (or another compatible browser) on the Android device. When domain verification is unavailable it falls back to a Custom Tab rather than full-screen trusted mode.
- Push notifications rely on the existing PWA service worker and Web Push subscriptions. Verify notification delivery from a Play-installed app before release.
- This repository build does not publish to Google Play automatically. The owner must review and submit the AAB through Play Console.
- A privacy policy and Data safety answers must accurately describe HomeBuddy's Supabase account, household, document and notification data handling before public listing.
