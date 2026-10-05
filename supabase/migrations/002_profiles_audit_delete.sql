-- Migración 002 — ejecutar en Supabase → SQL Editor (después de 001). Se puede re-ejecutar.
--
-- Agrega:
--   1. profiles       : una fila por usuario registrado (email, fecha de alta), creada sola al registrarse.
--   2. movement_log   : bitácora de auditoría de TODO movimiento creado o eliminado (queda aunque se borre).
--   3. delete_transaction(): permite a cada usuario quitar un ingreso o gasto propio.
--   4. admin_users / admin_movements: vistas para que vos controles usuarios y movimientos desde el
--      SQL Editor o el Table Editor. NO son accesibles desde la app (sin permisos para anon/authenticated).

-- ---------------------------------------------------------------- 1. profiles
create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists "read own" on public.profiles;
create policy "read own" on public.profiles for select to authenticated using (id = (select auth.uid()));
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, created_at)
  values (new.id, new.email, coalesce(new.created_at, now()))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Usuarios que ya existían antes de esta migración.
insert into public.profiles (id, email, created_at)
select id, email, created_at from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------- 2. bitácora de movimientos
-- Sin FK a propósito: el historial debe sobrevivir al borrado de movimientos y de usuarios.
create table if not exists public.movement_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  action      text not null check (action in ('create', 'delete')),
  user_id     uuid not null,
  tx_id       uuid not null,
  tx_type     text not null,
  amount      numeric(14,2) not null,
  category    text,
  note        text,
  occurred_on date
);

create index if not exists movement_log_user_idx on public.movement_log (user_id, at desc);

alter table public.movement_log enable row level security;       -- sin políticas: ningún usuario la ve
revoke all on public.movement_log from anon, authenticated;

create or replace function public.log_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.transactions;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  insert into public.movement_log (action, user_id, tx_id, tx_type, amount, category, note, occurred_on)
  values (case when tg_op = 'DELETE' then 'delete' else 'create' end,
          r.user_id, r.id, r.type, r.amount, r.category, r.note, r.occurred_on);
  return null;
end;
$$;
revoke execute on function public.log_transaction() from public, anon, authenticated;

drop trigger if exists transactions_log on public.transactions;
create trigger transactions_log
  after insert or delete on public.transactions
  for each row execute function public.log_transaction();

-- Movimientos anteriores a la migración, para que la bitácora arranque completa.
insert into public.movement_log (at, action, user_id, tx_id, tx_type, amount, category, note, occurred_on)
select t.created_at, 'create', t.user_id, t.id, t.type, t.amount, t.category, t.note, t.occurred_on
from public.transactions t
where not exists (select 1 from public.movement_log l where l.tx_id = t.id and l.action = 'create');

-- ------------------------------------- 3. quitar movimientos (ingreso o gasto)
-- Cada pago de cuota queda ligado al ingreso que lo generó, para poder deshacerlo junto con él.
alter table public.transactions
  add column if not exists income_id uuid references public.transactions on delete cascade;

-- Backfill: antes se insertaban en la misma transacción SQL, así que comparten created_at.
update public.transactions p
set income_id = i.id
from public.transactions i
where p.type = 'debt_payment' and p.income_id is null
  and i.type = 'income' and i.user_id = p.user_id and i.created_at = p.created_at;

create index if not exists transactions_income_idx on public.transactions (income_id);

-- Ingreso: ahora vincula cada pago de cuota con su ingreso (income_id).
create or replace function public.register_income(p_amount numeric, p_note text, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_date    date := coalesce(p_date, current_date);
  v_income  uuid;
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
  values (v_uid, 'income', remaining, 'Ingreso', nullif(p_note, ''), v_date)
  returning id into v_income;

  for d in
    select * from public.debts where user_id = v_uid and balance > 0 order by created_at
  loop
    pay := least(d.installment, d.balance, remaining);
    continue when pay <= 0;

    update public.debts set balance = balance - pay where id = d.id;
    insert into public.transactions (user_id, type, amount, category, note, debt_id, income_id, occurred_on)
    values (v_uid, 'debt_payment', pay, 'Deuda', d.name, d.id, v_income, v_date);

    remaining := remaining - pay;
    payments := payments || jsonb_build_object('debt_id', d.id, 'name', d.name, 'amount', pay);
  end loop;

  return jsonb_build_object('payments', payments, 'net', remaining);
end;
$$;

-- Elimina un ingreso o un gasto propio.
--  * Gasto: devuelve el dinero al disponible.
--  * Ingreso: deshace también las cuotas que descontó (restaura el saldo de las deudas), siempre que
--    el dinero neto de ese ingreso no se haya gastado ya.
--  * Un pago de cuota no se borra solo: se elimina el ingreso que lo generó.
create or replace function public.delete_transaction(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  t           public.transactions;
  v_paid      numeric;
  v_available numeric;
begin
  if v_uid is null then raise exception 'Debés iniciar sesión'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  select * into t from public.transactions where id = p_id and user_id = v_uid;
  if not found then raise exception 'Movimiento no encontrado'; end if;

  if t.type = 'debt_payment' then
    raise exception 'Una cuota se elimina junto con el ingreso que la generó';
  end if;

  if t.type = 'income' then
    select coalesce(sum(amount), 0) into v_paid
      from public.transactions where income_id = t.id and user_id = v_uid;

    select coalesce(sum(case when type = 'income' then amount else -amount end), 0)
      into v_available from public.transactions where user_id = v_uid;

    if v_available - (t.amount - v_paid) < 0 then
      raise exception 'No podés eliminar este ingreso: ya gastaste ese dinero';
    end if;

    -- Restaurar el saldo de las deudas afectadas (sin pasar del total original).
    update public.debts d
    set balance = least(d.total, d.balance + p.amt)
    from (select debt_id, sum(amount) as amt
            from public.transactions
           where income_id = t.id and user_id = v_uid and debt_id is not null
           group by debt_id) p
    where d.id = p.debt_id and d.user_id = v_uid;
  end if;

  delete from public.transactions where id = t.id and user_id = v_uid;  -- las cuotas caen por cascade
end;
$$;

revoke execute on function public.delete_transaction(uuid) from public, anon;
grant execute on function public.delete_transaction(uuid) to authenticated;
grant execute on function public.register_income(numeric, text, date) to authenticated;

-- ----------------------------------------------- 4. vistas para control (admin)
-- Las vistas corren con los permisos de su dueño (postgres) y se ven desde el SQL Editor / Table Editor.
-- Se les quitan los permisos a los roles de la API, así ningún usuario de la app puede consultarlas.

create or replace view public.admin_users as
select
  p.id,
  p.email,
  p.created_at                                                              as registered_at,
  u.last_sign_in_at,
  coalesce(sum(t.amount) filter (where t.type = 'income'), 0)               as total_income,
  coalesce(sum(t.amount) filter (where t.type = 'expense'), 0)              as total_expenses,
  coalesce(sum(t.amount) filter (where t.type = 'debt_payment'), 0)         as total_debt_paid,
  coalesce(sum(case when t.type = 'income' then t.amount
                    when t.type in ('expense', 'debt_payment') then -t.amount end), 0) as balance,
  count(t.id)                                                               as movements,
  max(t.created_at)                                                         as last_movement_at
from public.profiles p
left join auth.users u          on u.id = p.id
left join public.transactions t on t.user_id = p.id
group by p.id, p.email, p.created_at, u.last_sign_in_at;

create or replace view public.admin_movements as
select l.at, l.action, p.email, l.user_id, l.tx_type, l.amount, l.category, l.note, l.occurred_on, l.tx_id
from public.movement_log l
left join public.profiles p on p.id = l.user_id
order by l.at desc;

revoke all on public.admin_users, public.admin_movements from public, anon, authenticated;
