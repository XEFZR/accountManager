-- Rode no SQL Editor do Supabase.

-- 1) Perfis (plano de cada usuário)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro', 'business')),
  created_at timestamptz not null default now()
);

-- 2) Contas do Instagram conectadas
create table public.instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9._]{1,30}$'),
  status text not null default 'connected' check (status in ('connected', 'expired')),
  -- Em produção, guarde o token da Meta fora desta tabela (ou criptografado),
  -- e nunca o exponha ao navegador.
  created_at timestamptz not null default now(),
  unique (user_id, username)
);

-- 3) Cria o perfil automaticamente quando alguém se cadastra
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) Limite por plano, reforçado no banco (o front sozinho pode ser burlado)
create function public.enforce_account_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  user_plan text;
  max_accounts int;
  current_count int;
begin
  select plan into user_plan from public.profiles where id = new.user_id;
  max_accounts := case coalesce(user_plan, 'free')
    when 'business' then 100
    when 'pro' then 25
    else 5
  end;

  select count(*) into current_count from public.instagram_accounts where user_id = new.user_id;
  if current_count >= max_accounts then
    raise exception 'LIMITE_PLANO';
  end if;
  return new;
end;
$$;

create trigger check_account_limit
  before insert on public.instagram_accounts
  for each row execute function public.enforce_account_limit();

-- 5) Segurança por linha (RLS): cada usuário só enxerga e mexe no que é dele
alter table public.profiles enable row level security;
alter table public.instagram_accounts enable row level security;

create policy "ver proprio perfil"
  on public.profiles for select using (auth.uid() = id);
-- Sem policy de update em profiles: o plano só muda pelo backend (service role),
-- depois que o webhook de pagamento confirmar.

create policy "ver proprias contas"
  on public.instagram_accounts for select using (auth.uid() = user_id);

create policy "inserir proprias contas"
  on public.instagram_accounts for insert with check (auth.uid() = user_id);

create policy "remover proprias contas"
  on public.instagram_accounts for delete using (auth.uid() = user_id);
