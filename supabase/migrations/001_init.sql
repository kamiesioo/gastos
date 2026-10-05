-- Ejecutar completo en Supabase → SQL Editor. Se puede volver a correr sin perder datos.
--
-- Modelo de seguridad:
--   * Los usuarios viven en auth.users (los crea Supabase Auth en el sign up).
--   * Cada fila lleva user_id y RLS deja LEER sólo las propias.
--   * Los usuarios NO pueden insertar/actualizar/borrar directo en las tablas:
--     toda escritura pasa por las funciones de abajo, que validan montos y
--     operan siempre sobre auth.uid() (nunca sobre un id enviado por el cliente).

create table if not exists public.settings (
  user_id    uuid primary key references auth.users on delete cascade,
  saving_pct numeric(5,2) not null default 0 check (saving_pct between 0 and 100)
);

create table if not exists public.debts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  total       numeric(14,2) not null check (total > 0),
  balance     numeric(14,2) not null check (balance >= 0),
  installment numeric(14,2) not null check (installment > 0),
  created_at  timestamptz not null default now()
);

create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  type        text not null check (type in ('income', 'expense', 'debt_payment')),
  amount      numeric(14,2) not null check (amount > 0),
  category    text,
  note        text check (char_length(note) <= 80),
  debt_id     uuid references public.debts on delete set null,
  occurred_on date not null default current_date,
  created_at  timestamptz not null default now()
);

create index if not exists transactions_user_date_idx on public.transactions (user_id, occurred_on desc);
create index if not exists debts_user_idx on public.debts (user_id);

-- ---- Row Level Security: lectura sólo de lo propio, sin políticas de escritura.
alter table public.settings     enable row level security;
alter table public.debts        enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "own rows" on public.settings;
drop policy if exists "own rows" on public.debts;
drop policy if exists "own rows" on public.transactions;
drop policy if exists "read own" on public.settings;
drop policy if exists "read own" on public.debts;
drop policy if exists "read own" on public.transactions;

create policy "read own" on public.settings     for select to authenticated using (user_id = (select auth.uid()));
create policy "read own" on public.debts        for select to authenticated using (user_id = (select auth.uid()));
create policy "read own" on public.transactions for select to authenticated using (user_id = (select auth.uid()));

-- ---- Permisos de tabla: anónimos nada; autenticados sólo SELECT.
revoke all on public.settings, public.debts, public.transactions from anon, authenticated;
grant select on public.settings, public.debts, public.transactions to authenticated;

-- ---- Funciones de escritura (las únicas vías para modificar datos).

-- Ingreso: se registra completo y se descuenta la cuota de cada deuda activa.
create or replace function public.register_income(p_amount numeric, p_note text, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_date    date := coalesce(p_date, current_date);
  d         record;
  remaining numeric;
  pay       numeric;
  payments  jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'Debés iniciar sesión'; end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 1e12 then raise exception 'Monto inválido'; end if;
  if abs(v_date - current_date) > 1 then raise exception 'Fecha inválida'; end if;
  if char_length(coalesce(p_note, '')) > 80 then raise exception 'La nota es demasiado larga'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  remaining := round(p_amount, 2);

  insert into public.transactions (user_id, type, amount, category, note, occurred_on)
  values (v_uid, 'income', remaining, 'Ingreso', nullif(p_note, ''), v_date);

  for d in
    select * from public.debts where user_id = v_uid and balance > 0 order by created_at
  loop
    pay := least(d.installment, d.balance, remaining);
    continue when pay <= 0;

    update public.debts set balance = balance - pay where id = d.id;
    insert into public.transactions (user_id, type, amount, category, note, debt_id, occurred_on)
    values (v_uid, 'debt_payment', pay, 'Deuda', d.name, d.id, v_date);

    remaining := remaining - pay;
    payments := payments || jsonb_build_object('debt_id', d.id, 'name', d.name, 'amount', pay);
  end loop;

  return jsonb_build_object('payments', payments, 'net', remaining);
end;
$$;

-- Gasto: categoría de una lista fija y nunca más que el saldo disponible.
create or replace function public.register_expense(p_amount numeric, p_category text, p_note text, p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_date      date := coalesce(p_date, current_date);
  v_available numeric;
begin
  if v_uid is null then raise exception 'Debés iniciar sesión'; end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 1e12 then raise exception 'Monto inválido'; end if;
  if p_category is null or p_category <> all (array[
       'Alimentación','Transporte','Vivienda','Servicios','Salud','Educación','Ocio','Otros']) then
    raise exception 'Categoría inválida';
  end if;
  if abs(v_date - current_date) > 1 then raise exception 'Fecha inválida'; end if;
  if char_length(coalesce(p_note, '')) > 80 then raise exception 'La nota es demasiado larga'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  select coalesce(sum(case when type = 'income' then amount else -amount end), 0)
    into v_available
    from public.transactions where user_id = v_uid;

  if p_amount > v_available then raise exception 'Saldo insuficiente para este gasto'; end if;

  insert into public.transactions (user_id, type, amount, category, note, occurred_on)
  values (v_uid, 'expense', round(p_amount, 2), p_category, nullif(p_note, ''), v_date);
end;
$$;

create or replace function public.add_debt(p_name text, p_total numeric, p_installment numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_uid is null then raise exception 'Debés iniciar sesión'; end if;
  if char_length(v_name) not between 1 and 60 then raise exception 'Nombre de deuda inválido'; end if;
  if p_total is null or p_total <= 0 or p_total >= 1e12 then raise exception 'Monto total inválido'; end if;
  if p_installment is null or p_installment <= 0 or p_installment > p_total then
    raise exception 'La cuota debe ser mayor a cero y no superar el total';
  end if;
  if (select count(*) from public.debts where user_id = v_uid) >= 50 then
    raise exception 'Llegaste al máximo de deudas';
  end if;

  insert into public.debts (user_id, name, total, balance, installment)
  values (v_uid, v_name, round(p_total, 2), round(p_total, 2), round(p_installment, 2));
end;
$$;

create or replace function public.delete_debt(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Debés iniciar sesión'; end if;
  delete from public.debts where id = p_id and user_id = auth.uid();
end;
$$;

create or replace function public.set_saving_pct(p_pct numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Debés iniciar sesión'; end if;
  if p_pct is null or p_pct < 0 or p_pct > 100 then raise exception 'El porcentaje debe estar entre 0 y 100'; end if;
  insert into public.settings (user_id, saving_pct) values (auth.uid(), round(p_pct, 2))
  on conflict (user_id) do update set saving_pct = excluded.saving_pct;
end;
$$;

-- Sólo usuarios autenticados pueden ejecutarlas (por defecto Postgres las abre a PUBLIC).
revoke execute on function
  public.register_income(numeric, text, date),
  public.register_expense(numeric, text, text, date),
  public.add_debt(text, numeric, numeric),
  public.delete_debt(uuid),
  public.set_saving_pct(numeric)
from public, anon;

grant execute on function
  public.register_income(numeric, text, date),
  public.register_expense(numeric, text, text, date),
  public.add_debt(text, numeric, numeric),
  public.delete_debt(uuid),
  public.set_saving_pct(numeric)
to authenticated;
