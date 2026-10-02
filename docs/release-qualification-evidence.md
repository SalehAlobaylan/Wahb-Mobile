# Release qualification evidence

Use one copy of this document per immutable candidate. Leave unavailable values
as **BLOCKED**; never replace them with assumed passes.

| Gate                                            | Candidate evidence                                              | Status                                                |
| ----------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| Commit SHA / build number / runtime fingerprint | **BLOCKED — candidate not selected**                            | BLOCKED                                               |
| `npm run validate`                              | Run output and date                                             | PENDING                                               |
| `npm run release:verify`                        | Run output and date                                             | PENDING                                               |
| `npm run android:verify`                        | Run output and date                                             | PENDING                                               |
| `Wahb-Platform: npm run verify`                 | Run output and date                                             | PENDING                                               |
| Expo/EAS project linked                         | Real project ID held in EAS only                                | BLOCKED — owner authority required                    |
| OTA runtime available                           | `expo-updates` dependency and matching native build             | BLOCKED — dependency is not installed                 |
| Preview OTA + incompatible-runtime rejection    | Update groups and device evidence                               | BLOCKED — EAS authority required                      |
| Production rollout + rollback                   | Percentages, update groups, recovery evidence                   | BLOCKED — EAS authority required                      |
| iOS Associated Domains + AASA / Android Asset Links | App entitlement plus `release:links:verify` output             | BLOCKED — iOS entitlement, signing identifiers, and deployment required |
| Camera permission policy                        | Avatar picker behavior, declared privacy, generated manifests   | BLOCKED — app config conflicts with the no-camera policy |
| iPhone + paired Watch Now Playing               | Device, OS, build, date, result                                 | BLOCKED — physical test required                      |
| Android device matrix                           | Device, API, build, date, result                                | BLOCKED — physical test required                      |
| Accessibility/privacy matrix                    | Device, language, Dynamic Type, VoiceOver/TalkBack, date        | BLOCKED — physical test required                      |
| Saudi App Store Connect readback                | Availability, Arabic/English metadata, age/privacy/review notes | BLOCKED — paid enrollment required                    |

The detailed device matrices are in `docs/ios-release-checklist.md` and
`docs/android-release-checklist.md`. OTA actions use
`docs/ota-rollout-runbook.md`.
