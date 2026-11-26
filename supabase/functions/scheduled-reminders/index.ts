// Supabase Edge Function (Deno): Day 24 Window-Opens & Day 27+ Unpaid Nudges
// Schedule daily via pg_cron at 05:00 UTC (08:00 AM Africa/Addis_Ababa).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface AlertRow {
  household_id: string;
  shop_id: string;
  shop_name: string;
  balance_santim: number;
  user_id: string;
  expo_push_token: string;
  window_open_alerts: boolean;
  overdue_nudges: boolean;
}

function getAddisDayOfMonth(now = new Date()): number {
  const shifted = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return Number.parseInt(shifted.toISOString().slice(8, 10), 10);
}

function formatEtbSimple(santim: number): string {
  const whole = Math.floor(Math.abs(santim) / 100);
  const rem = Math.abs(santim) % 100;
  const formatted = whole.toLocaleString('en-US');
  return rem === 0 ? `${formatted} ETB` : `${formatted}.${String(rem).padStart(2, '0')} ETB`;
}

Deno.serve(async (req: Request) => {
  const cronSecret = Deno.env.get('QELET_CRON_SECRET');
  if (!cronSecret || req.headers.get('x-qelet-secret') !== cronSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const overrideDay = typeof body?.test_day === 'number' ? body.test_day : null;
  const dayOfMonth = overrideDay ?? getAddisDayOfMonth();

  const isWindowOpenDay = dayOfMonth === 24;
  const isOverdueNudgeDay = dayOfMonth >= 27;

  if (!isWindowOpenDay && !isOverdueNudgeDay) {
    return new Response(
      JSON.stringify({ dayOfMonth, sent: 0, reason: 'Outside day 24 or day 27+ alert dates' }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.rpc('get_unpaid_shop_balances_for_alerts');
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const rows = (data as AlertRow[]) ?? [];
  const byToken = new Map<string, AlertRow[]>();

  for (const row of rows) {
    if (!row.expo_push_token.startsWith('ExponentPushToken[')) continue;
    if (isWindowOpenDay && !row.window_open_alerts) continue;
    if (isOverdueNudgeDay && !row.overdue_nudges) continue;

    const list = byToken.get(row.expo_push_token);
    if (list) list.push(row);
    else byToken.set(row.expo_push_token, [row]);
  }

  const messages = Array.from(byToken.entries()).map(([token, shops]) => {
    const shopSummaries = shops
      .map((s) => `${s.shop_name} (${formatEtbSimple(s.balance_santim)})`)
      .join(', ');

    if (isWindowOpenDay) {
      return {
        to: token,
        sound: 'default',
        title: 'Qelet · Payment Window Opens (Days 24–26)',
        body: `Unpaid shops: ${shopSummaries}`,
        data: { kind: 'window_open' },
      };
    }

    return {
      to: token,
      sound: 'default',
      title: 'Qelet · Unpaid Shop Balance Reminder',
      body: `Still unpaid after day 26: ${shopSummaries}`,
      data: { kind: 'overdue_nudge' },
    };
  });

  if (messages.length === 0) {
    return new Response(JSON.stringify({ dayOfMonth, sent: 0 }), { status: 200 });
  }

  const expoResp = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });

  return new Response(
    JSON.stringify({ dayOfMonth, sent: messages.length, status: expoResp.status }),
    { headers: { 'Content-Type': 'application/json' }, status: 200 }
  );
});
