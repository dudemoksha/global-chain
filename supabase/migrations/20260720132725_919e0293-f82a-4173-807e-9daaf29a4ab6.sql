
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
