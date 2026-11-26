# Qelet Supabase Edge Functions (Phase 5 Reminders)

These two Deno Edge Functions run on the Supabase Free Tier (`500k` invocations/month):

1. `notify-partner`: Send instant partner push notifications via Expo Push API (using free FCM credentials attached to your Expo project) whenever a new row is inserted into `public.entries`.
   - Deploy: `npx supabase functions deploy notify-partner`
   - In Supabase Dashboard -> **Database -> Webhooks**, create an `INSERT` webhook on `public.entries` pointing to `https://<project-ref>.supabase.co/functions/v1/notify-partner` with header `x-qelet-secret: <YOUR_SECRET>`.
2. `scheduled-reminders`: Send Day 24 window-open alerts and Day 27+ daily unpaid nudges (8:00 AM Addis Ababa = `05:00 UTC`).
   - Deploy: `npx supabase functions deploy scheduled-reminders`
   - Enable `pg_cron` and `pg_net` in Supabase Extensions, then run:
     ```sql
     select cron.schedule(
       'qelet-daily-payday-alerts',
       '0 5 * * *',
       $$
       select net.http_post(
         url := 'https://<project-ref>.supabase.co/functions/v1/scheduled-reminders',
         headers := '{"Content-Type": "application/json", "x-qelet-secret": "<YOUR_SECRET>"}'::jsonb,
         body := '{}'::jsonb
       );
       $$
     );
     ```
   - You can test any date immediately by invoking `scheduled-reminders` with `{"test_day": 24}` or `{"test_day": 27}`.
