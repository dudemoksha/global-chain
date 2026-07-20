-- Trigger functions never need direct EXECUTE from clients.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- has_role must be callable by authenticated users because RLS policies invoke it,
-- but should not be reachable anonymously.
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;