# Wahb Mobile

The native iOS and Android client for Wahb. The app is built with Expo and
React Native, targets iPhone first, and deliberately has no web target.

## Product baseline

- Anonymous users can browse public content. Personalization and interactions
  that require an identity begin after login.
- Pods is an audio-first, full-screen feed. News is an editorial,
  story-slide experience.
- Portrait orientation is enforced.
- Arabic and English are first-class. Arabic uses Wahb's bundled Handicrafts
  family; English uses DM Sans and Playfair Display.
- `expo-video` owns feed video, including continued background audio when the
  source supports it. `expo-audio` owns dedicated podcasts and audio.
- Offline downloads are a primary future capability, but download persistence
  is not guessed in this foundation.

The current product surfaces and implemented/deferred behavior are summarized
in the parent monorepo's `docs/mobile.md`. The parent
`docs/wahb-mobile-grilling-decisions.md` is a historical decision record; later
decisions and implementation may supersede its earlier recommendations.

## Requirements

- Node.js 22.13 or newer for local development (`.nvmrc` selects Node 22; CI
  currently uses Node 24)
- npm
- Xcode for iOS development
- Android Studio for Android development

An Apple Developer Program subscription is **not** needed to run a development
build directly on a locally connected iPhone from Xcode. TestFlight and App
Store distribution will require the paid program later.

## Local setup

```bash
nvm use
npm install
cp .env.example .env
npm run ios
```

For a physical phone, replace `localhost` in `.env` with the Mac's LAN IP and
run Wahb's backend from the parent repository using `./start.sh`.

This app uses native modules and is developed through an Expo development
build, not Expo Go.

## Commands

| Command                          | Purpose                                             |
| -------------------------------- | --------------------------------------------------- |
| `npm start`                      | Start Metro for a development build                 |
| `npm run ios`                    | Generate/run the iOS development build              |
| `npm run android`                | Generate/run the Android development build          |
| `npm run validate`               | Typecheck, lint, formatting, repository hygiene, and tests |
| `npm run test:maestro:list`      | List committed Maestro device flows                 |
| `npm run test:maestro:smoke`     | Run Maestro flows on a configured simulator         |
| `npm run test:integration:local` | Confirm local CMS/IAM contracts after `../start.sh` |
| `npm run doctor`                 | Validate the Expo dependency/configuration graph    |
| `npm run prebuild:clean`         | Regenerate native projects from app config          |
| `npm run prebuild:verify`        | Clean CNG prebuild without installing dependencies |
| `npm run android:verify`         | Generate Android output and check its permissions   |
| `npm run release:verify`         | Check native release configuration                  |
| `npm run release:links:verify`   | Check deployed Universal/App Link association files |

## Architecture

Read [`docs/architecture.md`](docs/architecture.md) before adding features.
Generated `ios/` and `android/` projects are intentionally ignored; Expo
config plugins are the source of native configuration.

## Verification boundaries

Jest is hermetic: production, staging, and developer service requests fail
unless a test supplies a fixture transport. Maestro is device-only and is not
part of the hermetic JavaScript gate; install the [Maestro CLI](https://maestro.mobile.dev/getting-started/installing-maestro)
and use the flow-specific prerequisites described in `.maestro/*.yaml`. The
auth flow requires runner-provided `MAESTRO_EMAIL` and `MAESTRO_PASSWORD`; the
Saved/RTL flow requires a verified account fixture; feed flows require their
expected feed content to be available from the configured backend. This repo
does not include a Maestro fixture seeder, and the auth/deletion flow stops
before submitting the destructive request. The local integration command only
allows loopback CMS and IAM URLs, checks service health plus anonymous Pods and
News response shapes, and requires the parent stack to be started with
`./start.sh`.

## Security

Never commit credentials, service tokens, signing certificates, provisioning
profiles, or `.env` files. Mobile builds contain public clients: authorization
and data access must always be enforced by IAM and CMS.

## License

MIT
