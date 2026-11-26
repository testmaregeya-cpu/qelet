# Qelet Implementation Roadmap (`PLAN.md`)

This repository implements **Qelet** per [shop-credit-tracker-spec.md](./shop-credit-tracker-spec.md).

## Technical Stack & Verified Constraints
- **Client:** React Native + Expo (TypeScript), built for Android via local Gradle APK (`npx expo prebuild --platform android`) or EAS Preview APK (free tier). *Note: Expo Go does not support `@react-native-google-signin/google-signin` or SDK 53+ Android remote push notifications, so testing uses a custom APK / Dev Build.*
- **Backend:** Supabase Free Tier (PostgreSQL, Auth, Realtime, Edge Functions, `pg_cron` + `pg_net`).
  - **7-day pause safeguard:** Free Supabase projects pause after 7 days with no client API traffic (`pg_cron` alone does not prevent pausing), so opening Qelet weekly + periodic super-admin JSON/CSV exports keeps data safe.
  - **UTC+3 timezone safety:** All billing cycle calculations use explicit `Africa/Addis_Ababa` (`UTC+3`) local calendar dates (`entry_date`) rather than raw UTC timestamps.
  - **Server-enforced audit & roles:** `audit_log` writes happen inside PostgreSQL triggers; super-admin shop merging runs via a `SECURITY DEFINER` RPC (`merge_shops`).

## Phase Checklist
- [x] **Phase 0:** Spec locked (`Google + Email & Password`, `roll to next month` on days 24–26 post-payoff) and documented.
- [x] **Phase 1:** Auth (`Google` + `Email/Password`), 2-member household create/join (`super_admin` / `member`), Shops list (`needs_review`, admin approve/rename/merge/archive), server RLS + triggers, unit tests, typecheck/lint/doctor verified *(pending `.env`, SQL apply & 2-phone APK smoke check)*.
- [x] **Phase 2:** Itemized charges (`entry_lines`), payments, `price_memory`, FIFO billing engine (`roll to next month`), shop status badges (`PAID`, `OPEN`, `DUE SOON`, `DUE NOW`, `OVERDUE`) *(verified by 22 unit tests, typecheck & lint; pending live SQL apply & 2-phone smoke test)*.
- [x] **Phase 3:** Live Realtime sync, edit/void own entries, dispute flag & resolution, entry history UI (`get_entry_history` RPC + DB-trigger `audit_log`) *(verified by 29 unit tests, typecheck & lint; pending live SQL apply & 2-phone test)*.
- [x] **Phase 4:** Home dashboard cards (*Upcoming & due*, *Top balances*), quick-add presets, item suggestions + admin catalog (`categories`, `catalog_items`).
- [x] **Phase 5:** Local evening check-in (`expo-notifications`) + server-scheduled Day 24 / Day 27+ & instant partner push Edge Functions (`notify-partner`, `scheduled-reminders`).
- [x] **Phase 6:** Monthly insights charts, Telegram/WhatsApp & PDF statement share, Android quick-actions shortcut, Fingerprint/PIN App Lock, Dark Mode, Admin audit viewer & full JSON/CSV export *(all 10 test suites / 36 tests, typecheck, lint & 20/20 expo-doctor checks verified)*.
- [ ] **Phase 7:** Two-week real couple trial & stabilization on physical Android phones.
