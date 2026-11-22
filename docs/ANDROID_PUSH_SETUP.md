# Native Android remote push setup

HomeBuddy uses Expo Notifications for native remote push delivery. The app currently intentionally refuses to register a push token when the EAS project ID is missing.

## Required project configuration

1. Sign in to the Expo account that owns the HomeBuddy app.
2. Create or link the EAS project for slug `homebuddy` and Android package `com.homebuddy.app`.
3. Copy the EAS project ID (UUID). It is public configuration, not a secret.
4. Add it to `mobile/app.json`:

```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "YOUR_EAS_PROJECT_UUID"
      }
    }
  }
}
```

The native app already reads `Constants.expoConfig.extra.eas.projectId` and will use it when registering an Expo push token.

## Android FCM V1 credentials

In the Expo dashboard for the linked EAS project, configure Android push credentials using an FCM V1 service-account JSON generated for the Firebase project used by HomeBuddy.

- Upload the JSON through Expo's project credentials / push notification setup.
- Do not commit the JSON to GitHub.
- Do not paste the private key into ChatGPT or an issue.
- Keep Firebase service-account access restricted to the HomeBuddy/Expo deployment.

## Acceptance tests after configuration

- Rebuild and install the native Android APK.
- Confirm the app registers an Expo push token and saves it in `native_push_tokens`.
- Send a test push to one Android device.
- Create an assigned reminder and confirm the assignee receives it.
- Create a household-wide event and confirm each enabled household member receives the expected push.
- Verify disabled notifications and revoked permissions are respected.
