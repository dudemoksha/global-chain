
-- Create a non-exposed schema for internal SECURITY DEFINER helpers
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- Move has_role out of the exposed public API schema
alter function public.has_role(uuid, public.app_role) set schema private;

-- Recreate policies to reference private.has_role
drop policy if exists "Admins can view all roles" on public.user_roles;
create policy "Admins can view all roles"
  on public.user_roles for select
  to authenticated
  using (private.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
  on public.profiles for select
  to authenticated
  using (private.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins can update any profile" on public.profiles;
create policy "Admins can update any profile"
  on public.profiles for update
  to authenticated
  using (private.has_role(auth.uid(), 'admin'))
  with check (private.has_role(auth.uid(), 'admin'));

drop policy if exists "admins can read all suppliers" on public.suppliers;
create policy "admins can read all suppliers"
  on public.suppliers for select
  to authenticated
  using (private.has_role(auth.uid(), 'admin'));

-- Revoke direct API execute on the remaining SECURITY DEFINER RPCs.
-- Server functions will invoke these via the service role instead.
revoke execute on function public.upsert_organization(text, text, text) from anon, authenticated, public;
revoke execute on function public.get_supply_graph(uuid) from anon, authenticated, public;
