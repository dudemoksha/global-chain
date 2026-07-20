
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
