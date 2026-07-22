CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  temp_password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

-- Allow anyone to request a reset
CREATE POLICY "Anyone can request password resets" ON public.password_reset_requests
  FOR INSERT WITH CHECK (true);

-- Allow admins to view/update all requests
CREATE POLICY "Admins can manage reset requests" ON public.password_reset_requests
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.tier_role = 'admin'
    )
  );

GRANT ALL ON public.password_reset_requests TO authenticated;
GRANT ALL ON public.password_reset_requests TO anon;
GRANT ALL ON public.password_reset_requests TO service_role;
