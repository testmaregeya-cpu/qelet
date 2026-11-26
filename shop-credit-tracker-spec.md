# Qelet — Shop Credit Tracker: Final Spec (v1.2)

Android app for two people (**Tensay = super admin**, **girlfriend = member**) to log items taken on credit from many shops, record payments (full or partial), and track who added what and when.

---

## 1. Decisions Locked

| Topic | Decision |
|---|---|
| App name | **Qelet** |
| Platform | Android (free APK sideload, no Play Store fee) |
| Users | 2 max per household: **Tensay = `super_admin`**, girlfriend = `member` |
| Sync | Live sync via Supabase Realtime, internet required in v1 |
| Shops | Many different shops |
| Payments | Full and partial |
| Language | English only |
| Calendar | **Gregorian** (local `Africa/Addis_Ababa`, `UTC+3` calendar date; payment window day 24 to 26) |
| Currency | **ETB** (stored as integer `santim` = `ETB * 100`) |
| Cost | **$0 / Free**: Supabase free tier, free Google + Email/Password login, FCM push via Supabase Edge Functions (no Firebase Blaze card), local/EAS free APK |
| Stack | **React Native + Expo (TypeScript) + Supabase Free Tier** |
| New shops | Member can add a shop; marked `needs_review = true` for super admin |
| Wrong entries | Other person can flag an entry as **disputed** (amount unchanged, creator decides) |
| Login | **(b) Google + Email & Password** (free, reliable, no paid SMS) |
| Items | Tracked (`item_name`, `quantity`, `unit`, `unit_price_santim`, `line_total_santim`) |
| Payment window | Day **24 to 26** of each Gregorian month |
| Post-payoff cutoff (`24–26`) | **Roll to next month**: once a payment in days `24–26` pays the current bill in full, new charges added afterward on days `24–26` roll to next month's bill |
| Edit / void | **Only the person who added the entry** |
| Audit | Full append-only audit trail written server-side by PostgreSQL triggers |
| Item entry | Suggestions from past items **plus** an admin-managed item list |
| Smart features | Quick-add buttons with remembered prices; charts and monthly insights (per shop, item, person) |
| Reminders | Daily evening prompt; alert when day 24 window opens; nudge for unpaid balance after day 26; notify partner on every new entry |
| Security & UX extras | App lock (fingerprint or PIN fallback); creator avatar badges; dashboard cards (*Upcoming & due*, *Top balances*); long-press quick-add shortcut; dark mode; share shop statement via Telegram/WhatsApp |
| Super admin extras | Manage/merge/archive shops, categories, and item list; export all data; view full audit log |

Not included in v1: voice entry, budget limits, receipt photos, payment streaks, call-shop button, super admin overriding other people's entries, month close/reopen, SMS phone login.

---

## 2. Roles and Permissions

| Action | Member | Super admin |
|---|---|---|
| Add charge / record payment | Yes | Yes |
| Edit or void **own** entry | Yes | Yes |
| Edit or void **someone else's** entry | No | No |
| See entry history (who added, edited, voided) | Yes | Yes |
| Full audit log screen | No | Yes |
| Add a new shop | Yes (`needs_review = true`) | Yes |
| Review / rename / merge / archive shops | No | Yes (merge via server RPC) |
| Flag someone else's entry as disputed | Yes | Yes |
| Resolve a dispute on own entry | Yes | Yes |
| Manage categories and item list | No | Yes |
| Export all data | No | Yes |
| Share a shop statement | Yes | Yes |

---

## 3. Core Concept & Billing Rules

Everything is an immutable ledger entry. Nothing is ever deleted.

- **Charge (`+`)**: one or more item lines (`item_name`, `quantity`, `unit`, `unit_price_santim`, `line_total_santim`) and `total_amount_santim`.
- **Payment (`-`)**: amount paid to a shop (`total_amount_santim`).
- **Voided entry**: remains visible in history marked `VOID` with required `void_reason`; excluded from balances.
- **Balance per shop** = sum of non-voided charges minus sum of non-voided payments (in integer `santim`).

### Billing Cycles (`Africa/Addis_Ababa` `entry_date`)
- Standard bill window: day **27** of month `M-1` through day **26** of month `M` belongs to month `M`'s bill.
- **Roll-to-next-month rule (`24–26`):** Once a payment logged on days `24–26` brings a shop's current bill balance to `0`, any new charge added afterward during days `24–26` defaults to the **next** month's bill (`bill_month` = `M+1`), keeping the settled bill `PAID`.
- Payments allocate **FIFO to the oldest unpaid bill first** (partial payments reduce the oldest unpaid bill; remaining balance stays open/overdue).

### Shop Status Badge
| Badge | Rule |
|---|---|
| **PAID** | Current balance is `0` |
| **OPEN** | Balance > `0`, before day `21` |
| **DUE SOON** | Balance > `0`, days `21` to `23` |
| **DUE NOW** | Balance > `0`, days `24` to `26` |
| **OVERDUE** | Unpaid part of an older bill or past day `26` |

---

## 4. Build Phases

| Phase | Build | Done when |
|---|---|---|
| **0** | Lock spec (`Google + Email/Password`, `roll to next month`) | Approved |
| **1** | Expo TS scaffold, Supabase schema + RLS, Auth (Google + Email/Password), 2-member household link, Shops list (`needs_review` + admin review/rename/merge/archive) | Both phones log in, share shops, and enforce roles server-side |
| **2** | Charges with items, payments, `price_memory`, FIFO billing cycles, status badges | Numbers match hand calculation including partial payments & day 24–26 rollovers |
| **3** | Live sync, edit/void own entries, dispute workflow, entry history, DB-trigger audit log | Both phones update live; non-creator cannot edit |
| **4** | Dashboard cards (*Upcoming & due*, *Top balances*), quick-add buttons, suggestions + admin item list | Usual purchase logged in under 10 seconds |
| **5** | Reminders & push notifications (daily prompt, day 24, day 27+, partner alert) | All four reminder types fire on test dates |
| **6** | Insights charts, Telegram/WhatsApp statement sharing, quick-actions shortcut, App Lock, dark mode, admin audit & export | Statement opens in Telegram & WhatsApp; full export verified |
| **7** | Two weeks of real use & fixes | Zero lost or wrong entries |
