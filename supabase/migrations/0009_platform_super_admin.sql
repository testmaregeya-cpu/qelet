-- ==============================================================================
-- 0009_platform_super_admin.sql
-- Master Platform Super Admin Console & Security Infrastructure
-- Enables platform administrators to monitor KPIs, inspect households,
-- and manage / ban abusive platform users across all households.
-- ==============================================================================

-- 1. Platform Admins Table
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- 2. Banned / Suspended Users Table
CREATE TABLE IF NOT EXISTS public.banned_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT 'Violation of terms',
  banned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  banned_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.banned_users ENABLE ROW LEVEL SECURITY;

-- 3. Platform Admin Check Function
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = p_user_id
  );
$$;

-- 4. Seed Initial Platform Admins
INSERT INTO public.platform_admins (user_id)
SELECT id FROM auth.users WHERE email IN ('tensaylemessa@gmail.com', 'testmaregeyaa@gmail.com')
ON CONFLICT (user_id) DO NOTHING;

-- 5. RLS Policies
DROP POLICY IF EXISTS "platform_admins_select" ON public.platform_admins;
CREATE POLICY "platform_admins_select"
ON public.platform_admins FOR SELECT
TO authenticated
USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "banned_users_select" ON public.banned_users;
CREATE POLICY "banned_users_select"
ON public.banned_users FOR SELECT
TO authenticated
USING (public.is_platform_admin(auth.uid()));

-- 6. Trigger to Enforce Suspension Barrier on Mutations
CREATE OR REPLACE FUNCTION public.trg_check_banned_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.banned_users WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Your account has been suspended by the platform administrator.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_banned_user_entries ON public.entries;
CREATE TRIGGER trg_banned_user_entries
BEFORE INSERT OR UPDATE ON public.entries
FOR EACH ROW EXECUTE FUNCTION public.trg_check_banned_user();

DROP TRIGGER IF EXISTS trg_banned_user_shops ON public.shops;
CREATE TRIGGER trg_banned_user_shops
BEFORE INSERT OR UPDATE ON public.shops
FOR EACH ROW EXECUTE FUNCTION public.trg_check_banned_user();

-- 7. Platform Admin RPCs
CREATE OR REPLACE FUNCTION public.check_is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.get_platform_metrics()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_households_count INT;
  v_users_count INT;
  v_shops_count INT;
  v_gross_credit BIGINT;
  v_gross_payments BIGINT;
  v_banned_count INT;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Platform admin only';
  END IF;

  SELECT count(*) INTO v_households_count FROM public.households;
  SELECT count(*) INTO v_users_count FROM auth.users;
  SELECT count(*) INTO v_shops_count FROM public.shops WHERE archived = false;
  SELECT coalesce(sum(total_amount_santim), 0) INTO v_gross_credit FROM public.entries WHERE type = 'charge' AND voided = false;
  SELECT coalesce(sum(total_amount_santim), 0) INTO v_gross_payments FROM public.entries WHERE type = 'payment' AND voided = false;
  SELECT count(*) INTO v_banned_count FROM public.banned_users;

  RETURN jsonb_build_object(
    'total_households', v_households_count,
    'total_users', v_users_count,
    'total_shops', v_shops_count,
    'gross_credit_santim', v_gross_credit,
    'gross_payments_santim', v_gross_payments,
    'total_banned_users', v_banned_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_platform_users()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  display_name TEXT,
  household_id UUID,
  household_name TEXT,
  role TEXT,
  created_at TIMESTAMPTZ,
  is_banned BOOLEAN,
  ban_reason TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Platform admin only';
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::TEXT AS email,
    coalesce(m.display_name, split_part(u.email::TEXT, '@', 1)) AS display_name,
    m.household_id,
    coalesce(h.name, 'No Household') AS household_name,
    coalesce(m.role, 'unassigned') AS role,
    u.created_at,
    (b.user_id IS NOT NULL) AS is_banned,
    b.reason AS ban_reason
  FROM auth.users u
  LEFT JOIN public.members m ON m.user_id = u.id
  LEFT JOIN public.households h ON h.id = m.household_id
  LEFT JOIN public.banned_users b ON b.user_id = u.id
  ORDER BY u.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_platform_households()
RETURNS TABLE (
  household_id UUID,
  household_name TEXT,
  invite_code TEXT,
  created_at TIMESTAMPTZ,
  member_count BIGINT,
  shop_count BIGINT,
  total_balance_santim BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Platform admin only';
  END IF;

  RETURN QUERY
  SELECT
    h.id AS household_id,
    h.name AS household_name,
    h.invite_code,
    h.created_at,
    (SELECT count(*) FROM public.members m WHERE m.household_id = h.id) AS member_count,
    (SELECT count(*) FROM public.shops s WHERE s.household_id = h.id AND s.archived = false) AS shop_count,
    (
      SELECT coalesce(sum(CASE WHEN e.type = 'charge' THEN e.total_amount_santim ELSE -e.total_amount_santim END), 0)
      FROM public.entries e
      WHERE e.household_id = h.id AND e.voided = false
    ) AS total_balance_santim
  FROM public.households h
  ORDER BY h.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.ban_platform_user(p_target_user_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Platform admin only';
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot ban your own administrator account';
  END IF;

  INSERT INTO public.banned_users (user_id, reason, banned_by)
  VALUES (p_target_user_id, coalesce(btrim(p_reason), 'Violation of platform terms'), auth.uid())
  ON CONFLICT (user_id) DO UPDATE SET reason = EXCLUDED.reason, banned_at = now(), banned_by = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.unban_platform_user(p_target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Platform admin only';
  END IF;

  DELETE FROM public.banned_users WHERE user_id = p_target_user_id;
END;
$$;

-- 8. Grants
GRANT EXECUTE ON FUNCTION public.check_is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_platform_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_platform_households() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ban_platform_user(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unban_platform_user(UUID) TO authenticated;
