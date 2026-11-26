-- Qelet Migration 0007: Explicit Table & Schema Privileges for authenticated and service_role
-- Necessary when migrations are applied via Supabase CLI login role rather than dashboard superuser.
-- Note: RLS policies remain the authoritative row-level boundary on every table.

grant usage on schema public to authenticated, service_role;

-- Households & Members (created/joined via SECURITY DEFINER RPCs; updates guarded by RLS + triggers)
grant select, update on table public.households to authenticated;
grant select, update on table public.members to authenticated;

-- Shops & Catalog (deletes disallowed; archived flag used instead)
grant select, insert, update on table public.shops to authenticated;
grant select, insert, update on table public.categories to authenticated;
grant select, insert, update on table public.catalog_items to authenticated;

-- Ledger (entries created via atomic RPCs or creator RLS; lines/price_memory read-only to client)
grant select, insert, update on table public.entries to authenticated;
grant select on table public.entry_lines to authenticated;
grant select on table public.price_memory to authenticated;

-- Disputes & Settings
grant select, insert, update on table public.disputes to authenticated;
grant select, insert, update on table public.user_settings to authenticated;

-- Audit Log (read-only for super_admin via RLS; writes only via SECURITY DEFINER triggers/RPCs)
grant select on table public.audit_log to authenticated;

-- Full service_role access for Edge Functions (notify-partner, scheduled-reminders)
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
