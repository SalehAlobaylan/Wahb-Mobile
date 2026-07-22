# Android release checklist

## Build gate

Run from `Wahb-Mobile/` before every Android candidate:

```bash
npm run validate
npm run android:verify
cd android && ./gradlew app:assembleDebug --no-daemon
```

`android:verify` creates ignored native output, checks the resulting manifest,
then leaves the generated project uncommitted. The manifest must contain only
Internet, vibration, audio settings, and media foreground-service permissions.
It must not request notification, microphone, shared-storage, overlay, camera,
location, contacts, Bluetooth scan, or local-network access.

The media notification is an operating-system playback surface, not product
push registration. Wahb never calls Android's notification-permission request
in V1. If an Android version restricts notification display, do not add a
prompt merely to bypass that platform behavior; background playback remains
promptless and the issue is evaluated in the physical-device gate.

## Required device matrix

Before launch, use audience data to confirm the final coverage mix. Until then,
run this practical baseline with a real device for the media row. Wahb enforces
API 24 (Android 7.0) as its minimum SDK through the app config plugin:

| Android/API    | Form factor                         | Required focus                                                                   |
| -------------- | ----------------------------------- | -------------------------------------------------------------------------------- |
| 7.0 / API 24   | emulator or retained low-end device | minimum supported install, RTL, SQLite migration, offline cold launch            |
| 10 / API 29    | emulator                            | legacy navigation/back, browser/share, secure credentials                        |
| 13 / API 33    | physical phone                      | media notification behavior, Bluetooth, notification-prompt absence, audio focus |
| current stable | physical phone or emulator          | predictive back, process death, background/lock-screen playback, Arabic RTL      |

## Required Android journeys

- Run every `.maestro/*.yaml` flow on an Android emulator or device. The
  Android-only Back flow verifies route popping; the anonymous flow verifies
  playback and frozen offline recovery; the authenticated flow uses
  runner-provided `MAESTRO_EMAIL` and `MAESTRO_PASSWORD` and stops before
  destructive deletion; the Saved/RTL flow uses a verified fixture.
- Hardware Back closes a sheet or modal first, then pops the current route; the
  root feed follows normal Android exit behavior. Predictive Back must not
  leave a paused player or orphaned scrim.
- Start both video and audio playback, lock the device, background the app for
  more than three minutes, then return. Verify one media session, correct
  title/artwork, play/pause control, position continuity, and no duplicate
  audio.
- Test an interruption, Bluetooth connect/disconnect, speaker/headset route
  change, Wi-Fi/cellular transition, Low Power/Battery Saver, and process death.
  Relaunch must restore the saved feed position and offline snapshot without
  silently resuming remote playback.
- Confirm Android share and browser handoff, SecureStore session recovery,
  SQLite/outbox durability, tombstone reconciliation, adaptive icon, and Arabic
  mirrored layout.

## OTA boundary

Android follows the same EAS channels and runtime-fingerprint rule as iOS.
Anything that changes a permission, foreground service, config plugin, native
module, or Android manifest requires a new Android build; it is never an OTA.
