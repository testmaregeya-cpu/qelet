// Supabase Edge Function (Deno): Instant Partner Push Alert on New Charge/Payment
// Supports both direct authenticated client invocations (Bearer JWT) and Database Webhooks.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface DirectNotificationPayload {
  householdId: string;
  shopId: string;
  shopName?: string;
  type: 'charge' | 'payment';
  totalSantim: number;
  actorName?: string;
  entryId?: string;
}

interface EntryWebhookPayload {
  type: 'INSERT';
  table: string;
  record: {
    id: string;
    household_id: string;
    shop_id: string;
    type: 'charge' | 'payment';
    total_amount_santim: number;
    created_by: string;
  };
}

function formatEtbSimple(santim: number): string {
  const whole = Math.floor(Math.abs(santim) / 100);
  const rem = Math.abs(santim) % 100;
  const formatted = whole.toLocaleString('en-US');
  return rem === 0 ? `${formatted} ETB` : `${formatted}.${String(rem).padStart(2, '0')} ETB`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qelet-secret',
      },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Authenticate: Either via valid user JWT Bearer token OR via x-qelet-secret header
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  const webhookSecret = Deno.env.get('QELET_WEBHOOK_SECRET');
  const secretHeader = req.headers.get('x-qelet-secret');

  let callerUserId: string | null = null;
  if (jwt) {
    const { data: userData } = await supabase.auth.getUser(jwt);
    if (userData?.user) {
      callerUserId = userData.user.id;
    }
  }

  if (!callerUserId && (!webhookSecret || secretHeader !== webhookSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const bodyRaw = await req.json().catch(() => null);
  if (!bodyRaw) {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parse whether this is a direct invocation or a webhook payload
  let householdId: string;
  let shopId: string;
  let entryType: 'charge' | 'payment';
  let totalSantim: number;
  let actorUserId: string;
  let entryId: string | undefined;
  let presetShopName: string | undefined;
  let presetActorName: string | undefined;

  if (bodyRaw.record && bodyRaw.type === 'INSERT') {
    const wb = bodyRaw as EntryWebhookPayload;
    householdId = wb.record.household_id;
    shopId = wb.record.shop_id;
    entryType = wb.record.type;
    totalSantim = wb.record.total_amount_santim;
    actorUserId = wb.record.created_by;
    entryId = wb.record.id;
  } else {
    const direct = bodyRaw as DirectNotificationPayload;
    householdId = direct.householdId;
    shopId = direct.shopId;
    entryType = direct.type;
    totalSantim = direct.totalSantim;
    actorUserId = callerUserId ?? '';
    entryId = direct.entryId;
    presetShopName = direct.shopName;
    presetActorName = direct.actorName;
  }

  if (!householdId || !shopId) {
    return new Response(JSON.stringify({ error: 'Missing householdId or shopId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const [{ data: shop }, { data: members }, { data: settings }] = await Promise.all([
    presetShopName
      ? Promise.resolve({ data: { name: presetShopName } })
      : supabase.from('shops').select('name').eq('id', shopId).maybeSingle(),
    supabase.from('members').select('user_id, display_name').eq('household_id', householdId),
    supabase
      .from('user_settings')
      .select('user_id, expo_push_token, partner_alerts')
      .eq('household_id', householdId),
  ]);

  const actor = (members ?? []).find((m) => m.user_id === actorUserId);
  const actorName = presetActorName ?? actor?.display_name ?? 'Your partner';
  const shopName = shop?.name ?? 'a shop';
  const amountText = formatEtbSimple(totalSantim);

  const actionLabel = entryType === 'charge' ? 'added a credit charge of' : 'recorded a payment of';
  const title = entryType === 'charge' ? `New credit at ${shopName}` : `Payment at ${shopName}`;
  const body = `${actorName} ${actionLabel} ${amountText}.`;

  const pushTargets = (settings ?? []).filter(
    (s) =>
      s.user_id !== actorUserId &&
      s.partner_alerts === true &&
      typeof s.expo_push_token === 'string' &&
      s.expo_push_token.startsWith('ExponentPushToken[')
  );

  if (pushTargets.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: 'No active partner push tokens' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const messages = pushTargets.map((target) => ({
    to: target.expo_push_token,
    sound: 'default',
    title,
    body,
    data: { entryId, shopId, href: '/shops' },
  }));

  const expoResp = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });

  return new Response(
    JSON.stringify({ sent: messages.length, status: expoResp.status }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    }
  );
});
