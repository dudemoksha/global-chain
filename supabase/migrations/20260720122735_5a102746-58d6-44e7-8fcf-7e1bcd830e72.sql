-- ────────── ROLES ──────────
create type public.app_role as enum ('admin', 'operator');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

create policy "Users can view their own roles"
on public.user_roles for select
to authenticated
using (auth.uid() = user_id);

create policy "Admins can view all roles"
on public.user_roles for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

-- ────────── PROFILES ──────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  job_title text not null default '',
  work_email text not null default '',
  legal_name text not null default '',
  hq_country text not null default '',
  industry text not null default '',
  tier_role text not null default '',
  note text not null default '',
  is_approved boolean not null default false,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

create policy "Admins can view all profiles"
on public.profiles for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "Users can update their own profile fields"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id and is_approved = (select is_approved from public.profiles where id = auth.uid()));

create policy "Admins can update any profile"
on public.profiles for update
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ────────── SIGNUP HANDLER ──────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, full_name, job_title, work_email,
    legal_name, hq_country, industry, tier_role, note
  ) values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'job_title', ''),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'legal_name', ''),
    coalesce(new.raw_user_meta_data ->> 'hq_country', ''),
    coalesce(new.raw_user_meta_data ->> 'industry', ''),
    coalesce(new.raw_user_meta_data ->> 'tier_role', ''),
    coalesce(new.raw_user_meta_data ->> 'note', '')
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'operator')
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();