
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
