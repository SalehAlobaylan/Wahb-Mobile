# M12 App Store release candidate

## Declared product position

- Product: **Wahb**, a public, audio-first Arabic discovery app for For You
  media and live News stories.
- Initial App Store availability: **Public Distribution, Saudi Arabia only**.
  Do not select all regions or future regions at launch.
- Intended audience: **16+**. Complete App Store Connect’s current age-rating
  questionnaire truthfully for the V1 feature set, including moderated
  user-generated comments and reporting. Apple determines the storefront rating;
  do not enter a made-up fixed rating.
- No ads, IDFA, ATT, push registration, in-app purchases, subscriptions, social
  login, downloads, camera, microphone, location, contacts, Bluetooth scanning,
  local-network access, or account requirement for browsing in V1.
- Account creation exists, so in-app account deletion remains discoverable from
  Account and Settings, requires reauthentication, revokes access immediately,
  and completes deletion asynchronously with a confirmation email.

## Store metadata and privacy links

Use Arabic (Saudi Arabia) as the primary listing localization and ship the
English localization alongside it. The final screenshots must be captured from
the release candidate; do not submit mock, stale, or TestFlight-only imagery.

| App Store Connect field | Value for V1                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Privacy policy          | `https://wahb.salehspace.dev/ar/privacy`                                                                                           |
| Support URL             | `https://wahb.salehspace.dev/ar/support`                                                                                           |
| English privacy/support | `https://wahb.salehspace.dev/en/privacy`, `https://wahb.salehspace.dev/en/support`                                                 |
| App distribution        | Public, Saudi Arabia only                                                                                                          |
| Age position            | Intended 16+; Apple questionnaire is authoritative                                                                                 |
| Review access           | Anonymous browse must work; provide a verified review account for authenticated comments, Saved, profile, and deletion-path review |

The app privacy declaration is intentionally conservative and must match the
actual release binary: email address, user ID, opaque installation/device ID,
product interactions, user content, and crash/performance/other diagnostic data
are linked to the account when applicable; none are tracking. The purposes are
app functionality and, for product interactions, product personalization. Re-run
`npm run release:verify` and update the privacy declaration before every
submission when a data flow, SDK, or diagnostic behavior changes.

## Native and EAS readiness

`app.config.ts` is the native release source of truth:

- `com.salehspace.wahb`, portrait phone app, iOS 16.4 minimum, no watchOS
  target, associated domain, and standard system Now Playing support.
- `PrivacyInfo.xcprivacy` is generated through CNG with required-reason API and
  collected-data declarations; tracking is false.
- `ITSAppUsesNonExemptEncryption=false` records that Wahb uses only exempt
  platform transport encryption.
- EAS has `development`, internal `preview`, store-distributed `testflight`
  (preview channel), and `production` profiles. Runtime fingerprint and the
  OTA compatibility rule from M10 remain mandatory.

After paid Apple enrollment, create the EAS project and credentials; do not
invent or commit the project ID, Apple Team ID, certificate fingerprint, Apple
ID, app record ID, or API key. Configure those secrets in the appropriate Apple,
EAS, and Cranl consoles only.

Use [`ota-rollout-runbook.md`](ota-rollout-runbook.md) for preview, gradual
production rollout, rollback, and emergency-disable decisions. Record each
candidate in [`release-qualification-evidence.md`](release-qualification-evidence.md);
an unavailable external value is a release blocker, never an assumed pass.

## Association deployment gate

Set these production Wahb-Platform deployment values after signing exists:

| Deployment value               | Source                                                             |
| ------------------------------ | ------------------------------------------------------------------ |
| `APPLE_APP_ID_PREFIX`          | 10-character Apple Team ID                                         |
| `ANDROID_APP_LINK_CERT_SHA256` | comma-separated release signing certificate SHA-256 fingerprint(s) |

Redeploy Wahb-Platform, then run:

```bash
APPLE_APP_ID_PREFIX=YOUR_TEAM_ID \
ANDROID_APP_LINK_CERT_SHA256=YOUR_RELEASE_SHA256 \
npm run release:links:verify
```

The public AASA and Asset Links endpoints must return `200` and match the
release identifiers before testing Universal/App Links. A `503` is an intended
fail-closed state until exact identifiers are configured.

## Promotion sequence

1. Complete the iOS and Android physical-device checklists, including Apple
   Watch system Now Playing control on a paired watch. There is no watchOS app.
2. Run all validation, release-config, Android-manifest, Maestro, and public
   association checks against the release candidate.
3. Build with the EAS `testflight` profile; upload only after App Store Connect,
   signing, privacy responses, age questionnaire, Saudi availability, support
   URLs, and App Review notes are complete.
4. Promote the exact validated preview update/build to production only when
   feed, playback, moderation, deletion, privacy, accessibility, diagnostics,
   and operational checks are green.

Paid Apple enrollment, App Store Connect edits, EAS project/credentials,
signing, TestFlight distribution, and physical device acceptance are external
account actions and intentionally cannot be completed from this repository.
