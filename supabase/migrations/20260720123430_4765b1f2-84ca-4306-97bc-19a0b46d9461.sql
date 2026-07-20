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