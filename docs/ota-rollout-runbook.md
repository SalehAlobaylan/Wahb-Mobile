# OTA rollout and rollback runbook

This runbook becomes executable only after the owner creates the real EAS
project and explicitly authorizes its use. Do not invent or commit its project
ID, credentials, signing identifiers, update URL, or update group IDs.

## Preconditions

- The candidate has passed `npm run validate`, `npm run release:verify`, native
  build checks, and the physical-device matrix in
  `docs/release-qualification-evidence.md`.
- The update changes only JavaScript, styles, translations, or assets. Any
  native module, config plugin, permission, background mode, app-config, or
  runtime-fingerprint change requires a new native build.
- The actual EAS project is linked, `expo-updates` is installed using the
  matching Expo SDK command, and this strict source gate passes without
  printing any credential:

  ```bash
  REQUIRE_OTA_AUTHORITY=1 \\
  EAS_PROJECT_ID=REAL_EAS_PROJECT_ID \\
  EXPO_PUBLIC_EAS_PROJECT_ID=REAL_EAS_PROJECT_ID \\
  npm run release:verify
  ```

## Preview validation

1. Build the exact candidate with the `preview` channel.
2. Publish the update to `preview` using the pinned EAS CLI and record only the
   update group ID, runtime version, build number, commit SHA, and date in the
   evidence record.
3. Cold-launch the preview build online, then relaunch offline. Confirm the
   intended update loads only on the matching runtime fingerprint.
4. Install a build with a different native fingerprint. Confirm it does not
   load the preview update.

## Gradual production rollout

1. Publish the already-validated group to the `production` channel using the
   EAS rollout controls available at the time of release. Start with the
   smallest supported percentage.
2. Monitor only privacy-safe operational signals: startup, For You first
   render/session health, playback start/buffer/fallback timing, outbox health,
   crash-free sessions, and support reports. Do not add user-identifying
   dimensions to diagnose a rollout.
3. Increase gradually only after the declared observation window has no
   critical playback, auth, feed, privacy, or crash regression. Record every
   percentage, group ID, and decision in the evidence record.

## Rollback and emergency disable

- For a JavaScript-only regression, republish the last validated compatible
  update group to the affected channel, then verify cold-launch recovery on a
  device with the same runtime fingerprint.
- For a native/config/runtime regression, halt the rollout and ship a corrected
  native build; an OTA must not cross a runtime-fingerprint boundary.
- If no safe compatible update exists, disable further rollout in EAS and
  communicate the affected build range through the support channel. Never
  publish an unvalidated emergency patch solely to restore availability.

## Evidence required before promotion

Record the candidate build, runtime fingerprint, preview and production update
groups, rollout percentages/times, rollback test, owner, and links to the
device/privacy checks. A blank or unavailable value is a blocker, not a pass.
