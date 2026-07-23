-- Add price column to inventory_items
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS price numeric NOT NULL DEFAULT 100.0;

-- Drop function if exists to recreate
DROP FUNCTION IF EXISTS public.search_products_by_name(text);

-- Create product search function
CREATE OR REPLACE FUNCTION public.search_products_by_name(_query text)
RETURNS TABLE(
  sku text,
  product_name text,
  price numeric,
  unit text,
  org_id uuid,
  company_name text,
  country text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    i.sku, 
    i.name as product_name, 
    i.price, 
    i.unit, 
    o.id as org_id, 
    o.display_name as company_name,
    o.country
  FROM public.inventory_items i
  JOIN public.profiles p ON p.id = i.owner_id AND p.is_approved = true
  JOIN public.organizations o ON o.name_norm = public.normalize_org_name(p.legal_name)
  WHERE i.name ILIKE '%' || _query || '%'
  ORDER BY i.name ASC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.search_products_by_name(text) TO authenticated;
