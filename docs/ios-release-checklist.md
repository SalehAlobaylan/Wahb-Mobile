# iOS release checklist

## Before every candidate

Run these from `Wahb-Mobile/`:

```bash
npm run validate
npx expo config --type public
npm run prebuild:verify
```

`prebuild:verify` creates ignored `ios/` and `android/` output only. Do not
commit those directories. On a macOS runner, also run the unsigned simulator
build:

```bash
npx expo run:ios --configuration Debug --no-bundler
```

Use a development build installed with the Apple Personal Team while paid
Apple Developer enrollment is unavailable. Provisioning can expire in roughly
seven days, so record each physical-device result and reinstall when necessary.

## Required iPhone matrix

| Journey             | Pass condition                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cold online launch  | A fresh CMS session is materialized, then remains stable across app relaunch.                                                                                    |
| Cold offline launch | No session shows the branded offline state; a stored session shows its labelled frozen order.                                                                    |
| Offline media       | Artwork, title, transcript/About metadata, and position remain visible; tapping remote media says Connect to play.                                               |
| Reconnect           | Explicit refresh creates a new CMS session; stale/deleted content does not return from a tombstone.                                                              |
| Outbox              | Like, bookmark, report, progress, exposure, and completion remain visibly pending/durable until delivery or a recorded rejection.                                |
| VoiceOver           | Every feed, playback, sheet, auth, and destructive action has a useful label, role, value, and focus order.                                                      |
| Dynamic Type        | Largest supported text size keeps Arabic and English readable without clipped actions.                                                                           |
| RTL                 | Arabic route layout mirrors correctly; titles and mixed-language content retain readable direction.                                                              |
| Reduced Motion      | Core use remains understandable without relying on the transient play/pause pulse or movement.                                                                   |
| Audio lifecycle     | Lock, background, interruption, call/Siri/alarm, Bluetooth connect/disconnect, route change, and cold relaunch retain the documented pause/resume/restore rules. |
| Resource conditions | Validate Wi-Fi ↔ cellular, Low Power Mode, low-memory recovery, and a slow/failed source fallback.                                                               |

## Diagnostics privacy inspection

With a non-production Sentry DSN, inspect a sampled event and transaction.
Only a named diagnostic event, allow-listed dimensions, fixed transaction name,
and redacted exception value may be present. Reject a candidate if it contains
an email, raw UUID, URL/query, authorization data, content text, comment,
transcript, article body, screenshot, breadcrumb, or view hierarchy.

## OTA boundary

Use EAS `development`, `preview`, and `production` channels from `eas.json`.
Release an OTA only when the runtime fingerprint is unchanged and the patch is
limited to JavaScript, styles, translations, or assets. Native modules,
permissions, background behavior, app configuration, or native plugin changes
require a new iOS build and cannot be introduced through an OTA update.
