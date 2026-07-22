-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ ROLES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create type public.app_role as enum ('admin', 'operator');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

create policy "Users can view their own roles"
on public.user_roles for select
to authenticated
using (auth.uid() = user_id);

create policy "Admins can view all roles"
on public.user_roles for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ PROFILES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  job_title text not null default '',
  work_email text not null default '',
  legal_name text not null default '',
  hq_country text not null default '',
  industry text not null default '',
  tier_role text not null default '',
  note text not null default '',
  is_approved boolean not null default false,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

create policy "Admins can view all profiles"
on public.profiles for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "Users can update their own profile fields"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id and is_approved = (select is_approved from public.profiles where id = auth.uid()));

create policy "Admins can update any profile"
on public.profiles for update
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ SIGNUP HANDLER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, full_name, job_title, work_email,
    legal_name, hq_country, industry, tier_role, note
  ) values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'job_title', ''),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'legal_name', ''),
    coalesce(new.raw_user_meta_data ->> 'hq_country', ''),
    coalesce(new.raw_user_meta_data ->> 'industry', ''),
    coalesce(new.raw_user_meta_data ->> 'tier_role', ''),
    coalesce(new.raw_user_meta_data ->> 'note', '')
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'operator')
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();



-- Trigger functions never need direct EXECUTE from clients.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- has_role must be callable by authenticated users because RLS policies invoke it,
-- but should not be reachable anonymously.
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;



-- ============ organizations catalogue ============
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name_norm text not null unique,
  display_name text not null,
  country text not null default '',
  industry text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.organizations to authenticated;
grant all on public.organizations to service_role;

alter table public.organizations enable row level security;

create policy "authenticated can read organizations"
  on public.organizations for select
  to authenticated
  using (true);

create trigger set_organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ============ normalisation + upsert helpers ============
create or replace function public.normalize_org_name(_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(coalesce(_name, ''), '[^a-zA-Z0-9]', '', 'g'))
$$;

create or replace function public.upsert_organization(
  _name text,
  _country text,
  _industry text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _norm text := public.normalize_org_name(_name);
  _id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if _norm = '' then
    raise exception 'organization name required';
  end if;

  insert into public.organizations (name_norm, display_name, country, industry)
  values (_norm, trim(_name), coalesce(nullif(trim(_country), ''), ''), coalesce(nullif(trim(_industry), ''), ''))
  on conflict (name_norm) do update
    set
      display_name = case
        when length(public.organizations.display_name) < length(excluded.display_name)
        then excluded.display_name
        else public.organizations.display_name
      end,
      country = case
        when public.organizations.country = '' then excluded.country
        else public.organizations.country
      end,
      industry = case
        when public.organizations.industry = '' then excluded.industry
        else public.organizations.industry
      end
  returning id into _id;

  return _id;
end
$$;

revoke execute on function public.upsert_organization(text, text, text) from public;
grant execute on function public.upsert_organization(text, text, text) to authenticated;

-- ============ suppliers ============
create type public.criticality as enum ('low', 'medium', 'high', 'critical');

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  supplier_org_id uuid not null references public.organizations(id) on delete restrict,
  category text not null default '',
  criticality public.criticality not null default 'medium',
  annual_spend_bucket text not null default '',
  lead_time_days int,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, supplier_org_id)
);

create index suppliers_owner_idx on public.suppliers (owner_id);
create index suppliers_org_idx on public.suppliers (supplier_org_id);

grant select, insert, update, delete on public.suppliers to authenticated;
grant all on public.suppliers to service_role;

alter table public.suppliers enable row level security;

create policy "owner can read own suppliers"
  on public.suppliers for select
  to authenticated
  using (auth.uid() = owner_id);

create policy "owner can insert own suppliers"
  on public.suppliers for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "owner can update own suppliers"
  on public.suppliers for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "owner can delete own suppliers"
  on public.suppliers for delete
  to authenticated
  using (auth.uid() = owner_id);

create policy "admins can read all suppliers"
  on public.suppliers for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create trigger set_suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

-- ============ N-tier graph resolver ============
-- Returns tier-1 (your own) and tier-2 (suppliers of any supplier that
-- happens to also be an operator on Global-Chain, matched by legal_name).
-- Tier-2 rows never expose the intermediate operator's identity beyond the
-- supplier org node itself.
create or replace function public.get_supply_graph(_user_id uuid)
returns table(
  tier int,
  supplier_org_id uuid,
  supplier_name text,
  supplier_country text,
  supplier_industry text,
  parent_org_id uuid,
  criticality public.criticality,
  category text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if auth.uid() <> _user_id and not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden';
  end if;

  -- tier 1: user's own declared suppliers
  return query
  select
    1 as tier,
    o.id as supplier_org_id,
    o.display_name as supplier_name,
    o.country as supplier_country,
    o.industry as supplier_industry,
    null::uuid as parent_org_id,
    s.criticality,
    s.category
  from public.suppliers s
  join public.organizations o on o.id = s.supplier_org_id
  where s.owner_id = _user_id;

  -- tier 2: for each tier-1 supplier that matches a registered operator
  -- (profile.legal_name normalised == organizations.name_norm), pull that
  -- operator's suppliers as anonymised downstream nodes.
  return query
  select
    2 as tier,
    o2.id as supplier_org_id,
    o2.display_name as supplier_name,
    o2.country as supplier_country,
    o2.industry as supplier_industry,
    o1.id as parent_org_id,
    s2.criticality,
    s2.category
  from public.suppliers s1
  join public.organizations o1 on o1.id = s1.supplier_org_id
  join public.profiles p
    on public.normalize_org_name(p.legal_name) = o1.name_norm
   and p.is_approved = true
  join public.suppliers s2 on s2.owner_id = p.id
  join public.organizations o2 on o2.id = s2.supplier_org_id
  where s1.owner_id = _user_id
    -- avoid trivially pointing back to the user themselves
    and o2.name_norm <> (
      select public.normalize_org_name(pp.legal_name)
      from public.profiles pp where pp.id = _user_id
    );
end
$$;

revoke execute on function public.get_supply_graph(uuid) from public;
grant execute on function public.get_supply_graph(uuid) to authenticated;




-- Create a non-exposed schema for internal SECURITY DEFINER helpers
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- Move has_role out of the exposed public API schema
alter function public.has_role(uuid, public.app_role) set schema private;

-- Recreate policies to reference private.has_role
drop policy if exists "Admins can view all roles" on public.user_roles;
create policy "Admins can view all roles"
  on public.user_roles for select
  to authenticated
  using (private.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
  on public.profiles for select
  to authenticated
  using (private.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins can update any profile" on public.profiles;
create policy "Admins can update any profile"
  on public.profiles for update
  to authenticated
  using (private.has_role(auth.uid(), 'admin'))
  with check (private.has_role(auth.uid(), 'admin'));

drop policy if exists "admins can read all suppliers" on public.suppliers;
create policy "admins can read all suppliers"
  on public.suppliers for select
  to authenticated
  using (private.has_role(auth.uid(), 'admin'));

-- Revoke direct API execute on the remaining SECURITY DEFINER RPCs.
-- Server functions will invoke these via the service role instead.
revoke execute on function public.upsert_organization(text, text, text) from anon, authenticated, public;
revoke execute on function public.get_supply_graph(uuid) from anon, authenticated, public;




CREATE OR REPLACE FUNCTION public.get_supply_graph(_user_id uuid)
 RETURNS TABLE(tier integer, supplier_org_id uuid, supplier_name text, supplier_country text, supplier_industry text, parent_org_id uuid, criticality criticality, category text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  select
    1 as tier,
    o.id as supplier_org_id,
    o.display_name as supplier_name,
    o.country as supplier_country,
    o.industry as supplier_industry,
    null::uuid as parent_org_id,
    s.criticality,
    s.category
  from public.suppliers s
  join public.organizations o on o.id = s.supplier_org_id
  where s.owner_id = _user_id;

  return query
  select
    2 as tier,
    o2.id as supplier_org_id,
    o2.display_name as supplier_name,
    o2.country as supplier_country,
    o2.industry as supplier_industry,
    o1.id as parent_org_id,
    s2.criticality,
    s2.category
  from public.suppliers s1
  join public.organizations o1 on o1.id = s1.supplier_org_id
  join public.profiles p
    on public.normalize_org_name(p.legal_name) = o1.name_norm
   and p.is_approved = true
  join public.suppliers s2 on s2.owner_id = p.id
  join public.organizations o2 on o2.id = s2.supplier_org_id
  where s1.owner_id = _user_id
    and o2.name_norm <> (
      select public.normalize_org_name(pp.legal_name)
      from public.profiles pp where pp.id = _user_id
    );
end
$function$;

CREATE OR REPLACE FUNCTION public.upsert_organization(_name text, _country text, _industry text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _norm text := public.normalize_org_name(_name);
  _id uuid;
begin
  if _norm = '' then
    raise exception 'organization name required';
  end if;

  insert into public.organizations (name_norm, display_name, country, industry)
  values (_norm, trim(_name), coalesce(nullif(trim(_country), ''), ''), coalesce(nullif(trim(_industry), ''), ''))
  on conflict (name_norm) do update
    set
      display_name = case
        when length(public.organizations.display_name) < length(excluded.display_name)
        then excluded.display_name
        else public.organizations.display_name
      end,
      country = case
        when public.organizations.country = '' then excluded.country
        else public.organizations.country
      end,
      industry = case
        when public.organizations.industry = '' then excluded.industry
        else public.organizations.industry
      end
  returning id into _id;

  return _id;
end
$function$;




CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_key text NOT NULL,
  kind text NOT NULL,
  severity text NOT NULL,
  country text NOT NULL,
  headline text NOT NULL,
  detail text NOT NULL,
  supplier_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  supplier_name text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, signal_key)
);
CREATE INDEX alerts_user_created_idx ON public.alerts(user_id, created_at DESC);
CREATE INDEX alerts_user_unread_idx ON public.alerts(user_id) WHERE read_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operators read own alerts" ON public.alerts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "operators update own alerts" ON public.alerts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "operators delete own alerts" ON public.alerts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.supplier_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, supplier_id)
);
CREATE INDEX supplier_watches_user_idx ON public.supplier_watches(user_id);

GRANT SELECT, INSERT, DELETE ON public.supplier_watches TO authenticated;
GRANT ALL ON public.supplier_watches TO service_role;
ALTER TABLE public.supplier_watches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operators manage own watches" ON public.supplier_watches
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);




-- Profile status for admin suspend/activate
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended'));

-- Factories
CREATE TABLE public.factories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  country text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  capacity_units integer NOT NULL DEFAULT 0,
  products text[] NOT NULL DEFAULT '{}',
  warehouse text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.factories TO authenticated;
GRANT ALL ON public.factories TO service_role;
ALTER TABLE public.factories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own factories" ON public.factories FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER factories_updated BEFORE UPDATE ON public.factories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Inventory
CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sku text NOT NULL,
  name text NOT NULL,
  warehouse text NOT NULL DEFAULT '',
  current_stock integer NOT NULL DEFAULT 0,
  safety_stock integer NOT NULL DEFAULT 0,
  reorder_level integer NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'unit',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, sku)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own inventory" ON public.inventory_items FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER inventory_updated BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Upload history
CREATE TABLE public.upload_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('suppliers','factories','inventory')),
  filename text NOT NULL,
  rows_ok integer NOT NULL DEFAULT 0,
  rows_failed integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.upload_history TO authenticated;
GRANT ALL ON public.upload_history TO service_role;
ALTER TABLE public.upload_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own uploads" ON public.upload_history FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "insert own uploads" ON public.upload_history FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Audit log (admin visible)
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL DEFAULT '',
  target_id text NOT NULL DEFAULT '',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
-- Only admins can view audit logs
CREATE POLICY "admins view audit" ON public.audit_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
);



UPDATE auth.users SET email_confirmed_at = now() WHERE email_confirmed_at IS NULL;




-- Enums
DO $$ BEGIN
  CREATE TYPE public.request_direction AS ENUM ('buy', 'sell');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.request_status AS ENUM ('pending', 'accepted', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table
CREATE TABLE IF NOT EXISTS public.trade_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  to_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  direction public.request_direction NOT NULL,
  product text NOT NULL DEFAULT '',
  quantity text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  status public.request_status NOT NULL DEFAULT 'pending',
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_requests_from_idx ON public.trade_requests(from_user_id);
CREATE INDEX IF NOT EXISTS trade_requests_to_idx ON public.trade_requests(to_user_id);
CREATE INDEX IF NOT EXISTS trade_requests_to_org_idx ON public.trade_requests(to_org_id);

GRANT SELECT, INSERT, UPDATE ON public.trade_requests TO authenticated;
GRANT ALL ON public.trade_requests TO service_role;

ALTER TABLE public.trade_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sender can read own trade requests"
  ON public.trade_requests FOR SELECT TO authenticated
  USING (auth.uid() = from_user_id);

CREATE POLICY "recipient can read incoming trade requests"
  ON public.trade_requests FOR SELECT TO authenticated
  USING (auth.uid() = to_user_id);

CREATE POLICY "sender can insert own trade requests"
  ON public.trade_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "sender can cancel own trade requests"
  ON public.trade_requests FOR UPDATE TO authenticated
  USING (auth.uid() = from_user_id) WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "recipient can respond to trade requests"
  ON public.trade_requests FOR UPDATE TO authenticated
  USING (auth.uid() = to_user_id) WITH CHECK (auth.uid() = to_user_id);

CREATE TRIGGER set_trade_requests_updated_at
  BEFORE UPDATE ON public.trade_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Resolve which registered user owns an organization (by normalized legal name).
CREATE OR REPLACE FUNCTION public.get_user_for_org(_org_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.organizations o
  JOIN public.profiles p
    ON public.normalize_org_name(p.legal_name) = o.name_norm
   AND p.is_approved = true
  WHERE o.id = _org_id
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_user_for_org(uuid) TO authenticated;




-- Warehouses table
CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  lat double precision,
  lng double precision,
  capacity_units integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own warehouses" ON public.warehouses
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER set_warehouses_updated_at BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Extend inventory_items
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS warehouse_capacity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_production integer NOT NULL DEFAULT 0;




ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS product text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_stopped boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stopped_at timestamptz;

CREATE OR REPLACE FUNCTION public.list_org_products(_org_id uuid)
RETURNS TABLE(sku text, name text, unit text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.sku, i.name, i.unit
  FROM public.organizations o
  JOIN public.profiles p
    ON public.normalize_org_name(p.legal_name) = o.name_norm
   AND p.is_approved = true
  JOIN public.inventory_items i ON i.owner_id = p.id
  WHERE o.id = _org_id
  ORDER BY i.name ASC
  LIMIT 200
$$;

REVOKE ALL ON FUNCTION public.list_org_products(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_org_products(uuid) TO authenticated;



