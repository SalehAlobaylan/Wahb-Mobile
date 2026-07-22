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
repetition windows, and feed policy. `POST /api/v1/feed/foryou/sessions`
creates a six-hour frozen, identity-scoped CMS snapshot; the app persists its
opaque server session ID alongside the SQLite recovery ledger and only appends
pages from that session. It must not silently mix old inventory into a new
session.

Pull-to-refresh is an intentional session reset: it fetches and atomically
replaces the local session only after CMS successfully creates the new
snapshot. It is available only on the first card, confirms a successful reset
with a native success haptic and a New Content cue, and leaves the prior frozen
session and its progress intact on failure.

The For You surface renders that ordered snapshot through a vertically paged
native `FlatList`. Only the selected page attaches the shared video player;
neighbouring pages render their approved artwork or audio fallback. Reaching
the trailing pages asks the existing session for another cursor-bound page, not
a fresh ranking request. Button navigation remains available alongside the
swipe gesture for accessibility.

Hide This Item is a durable local preference scoped to the installation
identity. It atomically removes the item from the active snapshot, compacts the
remaining positions, and filters it from later locally materialized pages. CMS
does not yet offer the required installation/account hide or topic/source
preference contracts, so the app must not present this local hide as a global
ranking preference or expose a fake Not Interested action.

## Interaction delivery

Exposure and truthful completion events already enter a durable SQLite outbox
atomically with their frozen-session item marker, so restart cannot duplicate
or lose the event. The classifier counts only plausible continuous playback;
seek jumps do not create listening time. Likes, bookmarks, progress, and
reports extend the same outbox contract later. Like and bookmark create/delete
commands are ordered in that same ledger, so a quick toggle survives restart
and reaches CMS in the user's intended order; a replayed deletion treats an
already-absent interaction as success. Every creation mutation carries an
idempotency key and ordering sequence. The sender retries with backoff and
reconciles authoritative server state. Optimistic UI must visibly resolve or
roll back; it must never silently discard an action.

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

For You exposes a native playback progress indicator from the shared player
snapshot. A direct tap on the active media surface toggles playback and gives a
brief visual confirmation without a haptic; the explicit 44-point playback
button remains the accessible alternative. The speed control cycles only the
supported rates and persists the chosen rate for that item's media class, with
selection haptic feedback.

Haptics route through a small app-level feedback seam so Settings can later
persist a user preference. A sheet tab change and speed change use selection
feedback; a real sheet expand/collapse detent uses light impact; successful
refreshes and durable engagement changes use success; recoverable playback or
outbox failures use warning. Ordinary play/pause, swipes, and progress updates
remain silent.

Outside feed routes, the root layout mounts a compact Now Playing bar when a
global player is active. Opening it exposes pause/play, ±15-second seek, speed,
and dismissal; dismissal retains the item, timestamp, and prior play state for
a five-second Undo. Feed routes remain free of this horizontal bar so M5 can
provide the distinct News playback tile.

After a true end-of-media signal, For You presents a three-second Up Next
countdown and can replace playback only with the next item in the same frozen
session. Replay, manual navigation, a failed next source, or the end of that
session cancels advancement; it never crosses into a newly ranked session.

## For You detail surface

The production For You surface keeps cinematic content chrome compact: Fit,
Fill, and Transcript are explicit visual modes. Transcript uses only the
CMS-approved full-text response and presents a readable on-media excerpt over
the editorial red halo; it is intentionally not represented as timestamped
karaoke until CMS provides timed segments. The native draggable detail sheet
retains the full read-only Transcript alongside Comments and About. It does not
invent comments or transcript text when the public CMS endpoint has no approved
data. Comments remain read-only until the authenticated writing slice. Likes
and bookmarks already use the durable interaction ledger; the native share
sheet records a share only after the operating system reports it completed.

## News and reader continuity

News consumes a separately runtime-validated story-slide contract: one featured
story, no more than three related stories, explicit CMS lead/member IDs, and
coverage provenance. It is intentionally live rather than a six-hour For You
session. The app checks CMS at most once per 60 seconds and never replaces or
reorders the slide currently on screen. Unseen coverage stays behind an
explicit New Updates control; only that intentional action returns the reader
to the first slide and changes the slide order. Cursor pagination appends
without recycling prior slides.

Opening a story records its CMS story ID in the installation-scoped SQLite
history ledger before the reader opens. The later History surface can therefore
retain opened stories across News refreshes without using a stale News feed as
history storage.

The native reader persists complete CMS article snapshots and a scroll offset
in SQLite. A failed article fetch may render only that labelled saved copy; it
does not claim current content or turn media cache into a download. Original
Source validates HTTPS, shows the destination domain (and a warning for file
types) before it opens an Expo in-app browser. The browser handoff is a plain
URL with no Wahb credentials or headers. CMS-provided translation fields remain
optional and are visibly labelled when supplied.

News deliberately replaces the generic horizontal Now Playing bar with a
square editorial tile in its header. Active artwork fills the tile, its rounded
square progress ring reflects the one global player, tap toggles playback, and
long press with a light haptic opens expanded controls. An idle clock/news face
is shown when no item is active.

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

## Settings, legal, and deletion

Settings persist the UI/content-language choices, theme preference, autoplay,
haptics, and a default speed for video, podcast, and audio chapters. Controls
that do not yet affect the product (streaming quality, spatial audio,
downloads, and notifications) are explicitly unavailable rather than active
placeholders. The selected theme is applied as a native appearance override;
the existing editorial light/dark token pair remains the shared source for
surfaces as screen modules adopt it.

The About & Legal card opens stable Arabic or English pages at
`https://wahb.salehspace.dev/{locale}/…` for Privacy, Terms, Community
Guidelines, Support, Reporting, and open-source notices. The domain hosts
those pages in Wahb-Platform rather than embedding legal text inside the app.

Delete Account is available to an authenticated person from Account and
Settings. It requires the current password and has one irreversible warning.
After IAM accepts the request, the device clears its local Wahb partition and
returns to anonymous browsing immediately. IAM has already revoked credentials
and suspended the account at that point; it later calls CMS to erase product
data, hard-deletes the IAM identity, and sends the confirmation email only on
completion. There is intentionally no recovery window or deletion-status UI.

M6 keeps the access token in memory and the opaque refresh token only in
SecureStore. `AuthSessionManager` is the sole refresh-rotation owner, so
concurrent authenticated `401`s join one rotation rather than revoking one
another's refresh token. User-scoped query keys must contain the IAM subject;
logout removes those partitions without clearing anonymous public cache or the
installation ID. Reset Local Wahb Data is the explicit exception: it clears
local credentials, query state, SQLite feed/outbox/reader data, and regenerates
that installation ID.

The app recognizes only `https://wahb.salehspace.dev/...` public Universal
Links and `wahb://...` as a private fallback. It routes content, verification,
and reset intents through one dispatcher without logging a URL, token, or query
string. Production deployment still must publish the matching Apple App Site
Association and Android Asset Links files on `wahb.salehspace.dev`; native app
configuration alone cannot establish domain ownership.

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

## Diagnostics

`@sentry/react-native` is present through Expo Continuous Native Generation and
is enabled only when `EXPO_PUBLIC_SENTRY_DSN` is configured. A DSN is a public
client identifier, not an authentication secret. The runtime disables replay,
breadcrumbs, screenshots, view hierarchy capture, failed-request capture, and
session tracking. Performance tracing is production-sampled at 2%; every kept
transaction is reduced to the fixed `wahb.mobile` name with no spans, request,
or contexts. Its error scrubber retains only named, allow-listed diagnostic
context. Route diagnostics remove query strings and dynamic IDs. Authenticated
correlation is a truncated SHA-256 hash of the IAM user ID; raw IDs, emails,
content, credentials, URLs, transcript/article text, and comments never leave
the app through diagnostics.

The only lifecycle measurements are app start, frozen-session recovery,
playback start/buffer/fallback, and outbox health. Ranking and product behavior
remain CMS-owned; the native client does not send behavioral analytics to a
third party.

## M10 offline and release gates

An expired For You session may be reopened only as a labelled offline snapshot.
It has no cursor, cannot append or reshuffle, and remote media says **Connect
to play** rather than presenting player cache as a download. With no readable
snapshot, cold launch shows a distinct offline screen. A confirmed CMS `404`
from a durable interaction becomes a local tombstone, so deleted or moderated
content cannot reappear through a cached For You session; a `404` article also
removes its local reader snapshot.

`eas.json` defines isolated `development`, `preview`, and `production`
channels. Runtime fingerprinting prevents an OTA update from crossing a native
configuration boundary. Only JavaScript, styles, translations, and assets may
ship by OTA; any native module, permission, background mode, or app-config
change requires a new store build. The EAS project URL/ID is intentionally not
invented in source: add it only when the production EAS project is created.

CI performs JavaScript validation plus a clean CNG prebuild and unsigned iOS
Simulator build. Before release, run the documented physical-iPhone matrix:
VoiceOver, largest Dynamic Type, reduced motion, Arabic RTL, Wi-Fi/cellular
changes, Low Power Mode, background/lock screen, Bluetooth route changes,
interruptions, low-memory recovery, and cold offline launch. Simulator and a
Personal Team iPhone development build are the supported pre-TestFlight path;
the latter requires periodic reinstall when its provisioning expires.
Source-map upload credentials, if introduced, are build-time secrets and must
never be committed or exposed through `EXPO_PUBLIC_*` variables. Configure
`SENTRY_ORG`, `SENTRY_PROJECT`, and secret `SENTRY_AUTH_TOKEN` only in the
build environment when source-map and native-symbol upload is enabled.
