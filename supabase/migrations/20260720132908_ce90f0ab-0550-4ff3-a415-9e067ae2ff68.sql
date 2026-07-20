
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
