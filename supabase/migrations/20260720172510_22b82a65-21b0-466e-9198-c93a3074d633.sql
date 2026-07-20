
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
