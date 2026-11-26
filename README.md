# Qelet — Shop Credit Tracker (v1.2 Complete Build)

Android app for two people (**Tensay = super admin**, **girlfriend = member**) to track shared shop credit in **ETB** with live **Supabase** sync.

See [shop-credit-tracker-spec.md](./shop-credit-tracker-spec.md) and [PLAN.md](./PLAN.md) for the specification and phase checklist.

---

## Implemented Capabilities (Phases 1–6)
- **Auth & 2-Member Household:** Google Sign-In + Email & Password, 6-character invite code linking (capped at 2 members with `super_admin` + `member` roles enforced on Postgres).
- **Shops & Ledger:** Multi-shop credit charges with itemized lines (`quantity_milli`, integer `santim`), full/partial payments, `price_memory`, FIFO oldest-bill-first monthly calculations, day `24–26` post-payoff **roll-to-next-month** rule, and status badges (`PAID`, `OPEN`, `DUE SOON`, `DUE NOW`, `OVERDUE`).
- **Trust & Audit Trail:** Creator-only edit/void (`void_reason` required), partner dispute flagging + creator resolution, entry history timeline, and full DB-trigger `audit_log` for `super_admin`.
- **Dashboard & Catalog:** *Upcoming & Due* and *Top Balances* cards, 1-tap Quick-Add buttons, merged past + admin-managed catalog item suggestions (`categories`, `catalog_items`).
- **Reminders & Push Alerts:** Local daily evening prompt (`expo-notifications`), settings toggles, and Supabase Edge Functions ([supabase/functions/](./supabase/functions/README.md)) for instant partner push alerts, Day 24 window opens, and Day 27+ unpaid nudges.
- **Insights, Export & Security:** Monthly spending insights (by person, shop, top items), Telegram/WhatsApp text + PDF shop statement sharing, Android long-press quick-add shortcuts, Fingerprint + SHA-256 PIN App Lock, Light/Dark/System theme, and Super Admin JSON/CSV data export.

---

## Setup Instructions (Free Tier)

### 1. Create Supabase Project & Apply Schema
1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run in order:
   - [`supabase/migrations/0001_phase1_schema.sql`](./supabase/migrations/0001_phase1_schema.sql)
   - [`supabase/migrations/0002_phase2_ledger.sql`](./supabase/migrations/0002_phase2_ledger.sql)
   - [`supabase/migrations/0003_phase3_edit_void_disputes.sql`](./supabase/migrations/0003_phase3_edit_void_disputes.sql)
   - [`supabase/migrations/0004_phase4_catalog.sql`](./supabase/migrations/0004_phase4_catalog.sql)
   - [`supabase/migrations/0005_phase5_reminders.sql`](./supabase/migrations/0005_phase5_reminders.sql)
   - [`supabase/migrations/0006_phase6_admin_export.sql`](./supabase/migrations/0006_phase6_admin_export.sql)
   - [`supabase/migrations/0007_role_grants.sql`](./supabase/migrations/0007_role_grants.sql)
3. In **Authentication -> Providers -> Email**, keep Email enabled (optionally disable "Confirm email" during private couple setup).
4. Optional (Phase 5 server push alerts): see [`supabase/functions/README.md`](./supabase/functions/README.md).

### 2. Configure Google Sign-In (Free)
1. Get your debug APK SHA-1 fingerprint on Windows:
   ```powershell
   keytool -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
   ```
2. In Google Cloud Console:
   - Create an **Android** OAuth Client ID using package `com.tensay.qelet` and your SHA-1 fingerprint.
   - Create a **Web application** OAuth Client ID and copy its **Client ID** and **Client Secret**.
3. In **Supabase -> Authentication -> Providers -> Google**, enable Google and paste the **Web Client ID** and **Web Client Secret**.

### 3. Configure `.env`
Copy `.env.example` to `.env` and fill in your values:
```powershell
Copy-Item .env.example .env
```

### 4. Build Free Android APK Locally (or via EAS)
> Note: Native Google Sign-In, quick actions, and Android SDK 53+ remote push notifications require a built APK rather than Expo Go.

```powershell
npx expo prebuild --platform android
cd android
.\gradlew.bat assembleDebug
```
The APK will be generated at `android/app/build/outputs/apk/debug/app-debug.apk`.
