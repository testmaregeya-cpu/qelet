-- Qelet Phase 6 Schema: Login Audit Hook & Super-Admin Full Data Export RPC

-- 1. Log household login event (writes once per client session check-in)
create or replace function public.record_login_event()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_household_id uuid;
begin
  if v_uid is null then
    return;
  end if;

  select m.household_id into v_household_id
  from public.members m
  where m.user_id = v_uid;

  if v_household_id is not null then
    perform public.write_audit_log(
      v_household_id,
      v_uid,
      'household_login',
      'member',
      v_uid,
      null,
      jsonb_build_object('user_id', v_uid)
    );
  end if;
end;
$$;

-- 2. Super-admin full household data export (audit-logged)
create or replace function public.export_household_data(p_household_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_export jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_super_admin(p_household_id) then
    raise exception 'Only super_admin can export all household data';
  end if;

  perform public.write_audit_log(
    p_household_id,
    v_uid,
    'data_exported',
    'household',
    p_household_id,
    null,
    jsonb_build_object('exported_at', now())
  );

  select jsonb_build_object(
    'exported_at', now(),
    'currency', 'ETB',
    'household', (
      select to_jsonb(h) from public.households h where h.id = p_household_id
    ),
    'members', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.joined_at)
      from public.members m where m.household_id = p_household_id
    ), '[]'::jsonb),
    'shops', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at)
      from public.shops s where s.household_id = p_household_id
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.sort_order, c.name)
      from public.categories c where c.household_id = p_household_id
    ), '[]'::jsonb),
    'catalog_items', coalesce((
      select jsonb_agg(to_jsonb(ci) order by ci.name)
      from public.catalog_items ci where ci.household_id = p_household_id
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.entry_date desc, e.created_at desc)
      from public.entries e where e.household_id = p_household_id
    ), '[]'::jsonb),
    'entry_lines', coalesce((
      select jsonb_agg(to_jsonb(el) order by el.entry_id, el.sort_order)
      from public.entry_lines el where el.household_id = p_household_id
    ), '[]'::jsonb),
    'price_memory', coalesce((
      select jsonb_agg(to_jsonb(pm) order by pm.use_count desc)
      from public.price_memory pm where pm.household_id = p_household_id
    ), '[]'::jsonb),
    'disputes', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.raised_at desc)
      from public.disputes d where d.household_id = p_household_id
    ), '[]'::jsonb),
    'audit_log', coalesce((
      select jsonb_agg(to_jsonb(al) order by al.at desc)
      from public.audit_log al where al.household_id = p_household_id
    ), '[]'::jsonb)
  ) into v_export;

  return v_export;
end;
$$;

revoke all on function public.record_login_event() from public;
revoke all on function public.export_household_data(uuid) from public;
grant execute on function public.record_login_event() to authenticated;
grant execute on function public.export_household_data(uuid) to authenticated;
