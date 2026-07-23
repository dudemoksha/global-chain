-- Create trigger function to automatically link suppliers when a trade request is accepted
CREATE OR REPLACE FUNCTION public.handle_accepted_trade_request()
RETURNS TRIGGER AS $$
DECLARE
  buyer_user_id uuid;
  seller_user_id uuid;
  seller_org_id uuid;
  seller_profile record;
BEGIN
  -- Check if status changed to accepted
  IF NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status != 'accepted') THEN
    -- Determine buyer and seller user IDs
    IF NEW.direction = 'buy' THEN
      buyer_user_id := NEW.from_user_id;
      seller_user_id := NEW.to_user_id;
      seller_org_id := NEW.to_org_id;
    ELSE
      buyer_user_id := NEW.to_user_id;
      seller_user_id := NEW.from_user_id;
      seller_org_id := NEW.from_org_id;
    END IF;

    -- If seller_org_id is null, try to resolve it from the seller profile
    IF seller_org_id IS NULL AND seller_user_id IS NOT NULL THEN
      SELECT legal_name, hq_country, industry INTO seller_profile 
      FROM public.profiles 
      WHERE id = seller_user_id;
      
      IF seller_profile.legal_name IS NOT NULL AND trim(seller_profile.legal_name) != '' THEN
        seller_org_id := public.upsert_organization(
          seller_profile.legal_name,
          coalesce(seller_profile.hq_country, ''),
          coalesce(seller_profile.industry, '')
        );
      END IF;
    END IF;

    -- Insert into suppliers if we have buyer and seller org
    IF buyer_user_id IS NOT NULL AND seller_org_id IS NOT NULL THEN
      INSERT INTO public.suppliers (
        owner_id,
        supplier_org_id,
        category,
        criticality,
        annual_spend_bucket,
        product,
        notes
      ) VALUES (
        buyer_user_id,
        seller_org_id,
        coalesce(NEW.category, ''),
        'medium',
        '',
        coalesce(NEW.product, ''),
        CASE 
          WHEN NEW.product IS NOT NULL AND NEW.product != '' THEN 
            'Auto-linked via trade request: ' || NEW.product || CASE WHEN NEW.quantity IS NOT NULL AND NEW.quantity != '' THEN ' × ' || NEW.quantity ELSE '' END
          ELSE 
            'Auto-linked via accepted trade request'
        END
      )
      ON CONFLICT (owner_id, supplier_org_id) DO UPDATE 
      SET 
        product = coalesce(NEW.product, public.suppliers.product),
        category = coalesce(NEW.category, public.suppliers.category);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
CREATE OR REPLACE TRIGGER on_trade_request_accepted
  AFTER INSERT OR UPDATE ON public.trade_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_accepted_trade_request();

-- Backfill any existing accepted trade requests
DO $$
DECLARE
  r record;
  buyer_user_id uuid;
  seller_user_id uuid;
  seller_org_id uuid;
  seller_profile record;
BEGIN
  FOR r IN SELECT * FROM public.trade_requests WHERE status = 'accepted' LOOP
    IF r.direction = 'buy' THEN
      buyer_user_id := r.from_user_id;
      seller_user_id := r.to_user_id;
      seller_org_id := r.to_org_id;
    ELSE
      buyer_user_id := r.to_user_id;
      seller_user_id := r.from_user_id;
      seller_org_id := r.from_org_id;
    END IF;

    IF seller_org_id IS NULL AND seller_user_id IS NOT NULL THEN
      SELECT legal_name, hq_country, industry INTO seller_profile FROM public.profiles WHERE id = seller_user_id;
      IF seller_profile.legal_name IS NOT NULL AND trim(seller_profile.legal_name) != '' THEN
        seller_org_id := public.upsert_organization(
          seller_profile.legal_name,
          coalesce(seller_profile.hq_country, ''),
          coalesce(seller_profile.industry, '')
        );
      END IF;
    END IF;

    IF buyer_user_id IS NOT NULL AND seller_org_id IS NOT NULL THEN
      INSERT INTO public.suppliers (
        owner_id,
        supplier_org_id,
        category,
        criticality,
        annual_spend_bucket,
        product,
        notes
      ) VALUES (
        buyer_user_id,
        seller_org_id,
        coalesce(r.category, ''),
        'medium',
        '',
        coalesce(r.product, ''),
        CASE 
          WHEN r.product IS NOT NULL AND r.product != '' THEN 
            'Auto-linked via trade request: ' || r.product || CASE WHEN r.quantity IS NOT NULL AND r.quantity != '' THEN ' × ' || r.quantity ELSE '' END
          ELSE 
            'Auto-linked via accepted trade request'
        END
      )
      ON CONFLICT (owner_id, supplier_org_id) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;
