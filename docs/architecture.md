# Mobile architecture

## Principles

1. Build native iOS and Android behavior, not a wrapped copy of the website.
2. Preserve the CMS and IAM contracts and service boundaries from Wahb.
3. Keep playback, feed order, identity, and offline state explicit and
   deterministic.
4. Prefer Expo development builds and Continuous Native Generation. Generated
   native projects are build output, not hand-maintained source.
5. Ship iPhone first while keeping shared behavior portable to Android.

## Runtime layers

```text
Expo Router routes
  └─ Feature modules
      ├─ UI and gestures
      ├─ Feature controllers
      └─ Query/mutation adapters
          ├─ CMS public and authenticated APIs
          ├─ IAM authentication APIs
          └─ Local persistence
```

Feature code belongs under `src/features/<feature>`. Shared infrastructure
belongs under `src/core`. Brand tokens and reusable primitives belong under
`src/design`. Route files should remain thin.

## State ownership

| State                     | Owner                      | Examples                             |
| ------------------------- | -------------------------- | ------------------------------------ |
| Remote server state       | TanStack Query             | feeds, content, engagement counts    |
| Durable operational state | SQLite                     | frozen feed sessions, event outbox   |
| Credentials               | SecureStore                | access/refresh credentials           |
| Transient interface state | Zustand or component state | sheet state, active display mode     |
| Small preferences         | MMKV when introduced       | language override, playback defaults |

Do not duplicate server state into Zustand. Do not put tokens in AsyncStorage,
SQLite, logs, or query persistence.

## Feed stability

A feed response is materialized as an ordered session. Pagination appends to
that session; UI rerenders never reshuffle it. The local `feed_sessions` and
`feed_session_items` tables provide a durable frozen snapshot for process
restart and honest offline restoration.

The server remains responsible for candidate selection, personalization,
repetition windows, and feed policy. The app supplies stable session/cursor
context and must not silently mix old inventory into a new session.

## Interaction delivery

Likes, bookmarks, progress, reports, and exposure events will use a durable
SQLite outbox. Every mutation carries an idempotency key and ordering sequence.
The sender retries with backoff and reconciles authoritative server state.
Optimistic UI must visibly resolve or roll back; it must never silently discard
an action.

## Playback

One Wahb playback controller will own the active item, timestamp, rate, system
metadata, and audio-session policy.

- Feed video uses `expo-video`.
- Dedicated podcast/audio playback uses `expo-audio`.
- When a video backgrounds, keep the same video player alive and audible
  first. Do not transfer playback to a second audio player merely because the
  app backgrounded.
- Only one player may own system Now Playing metadata at a time.
- Picture in Picture is disabled for v1.

Playback position writes must be throttled and checkpointed at lifecycle
boundaries rather than written every frame.

## Downloads

Downloads are a primary planned capability, but player cache is never treated
as a download. The future subsystem needs:

- CMS-issued download manifests with stable IDs and integrity metadata
- resumable file transfer into app-owned storage
- SQLite metadata for state, entitlement, integrity, and eviction
- storage budgeting and user-controlled removal
- background transfer behavior validated separately on iOS and Android

Download tables and a transfer engine should be introduced only with that
contract. The current database migration layer is ready to add them safely.

## Identity and privacy

Anonymous browsing uses a device-scoped identity partition. Login must merge or
retire anonymous state through an explicit policy. Logout clears credentials
immediately and isolates account-scoped cached data.

Universal Links will own verified-email and password-reset journeys. Social
login is intentionally deferred.

## Native configuration

`app.config.ts` is the source of truth:

- portrait only
- phone form factor only on iOS
- background playback enabled for video and audio
- microphone and audio recording permissions disabled
- Picture in Picture disabled
- RTL support enabled

Expo SDK 57 establishes the minimum supported platforms: iOS 16.4 and Android
7.0. Raising either minimum requires a documented product decision.
