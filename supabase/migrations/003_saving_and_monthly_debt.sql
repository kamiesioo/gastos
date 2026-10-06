-- Migración 003 — ejecutar en Supabase → SQL Editor (después de 001 y 002). Se puede re-ejecutar.
--
-- Cambios:
--   1. Nuevo tipo de movimiento 'saving': al registrar un ingreso se aparta el % de ahorro y se
--      descuenta del saldo disponible (queda ligado al ingreso, así que se borra junto con él).
--   2. Las cuotas de deuda ya NO se descuentan solas con cada ingreso: se pagan con
--      pay_month_debts() ("Deuda del mes pagada"), una vez por deuda y por mes.
--   3. delete_transaction() también puede quitar un pago de deuda manual (restaura el saldo).
--   4. admin_users suma total_saved y lo descuenta del balance.

-- ------------------------------------------------------------ 1. tipo 'saving'
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions
  add constraint transactions_type_check check (type in ('income', 'expense', 'debt_payment', 'saving'));

-- ------------------------------------------------- ingreso: aparta el ahorro
create or replace function public.register_income(p_amount numeric, p_note text, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_date   date := coalesce(p_date, current_date);
  v_income uuid;
  v_pct    numeric;
  v_amount numeric;
  v_saving numeric;
begin
  if v_uid is null then raise exception 'Debés iniciar sesión'; end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 1e12 then raise exception 'Monto inválido'; end if;
  if abs(v_date - current_date) > 1 then raise exception 'Fecha inválida'; end if;
  if char_length(coalesce(p_note, '')) > 80 then raise exception 'La nota es demasiado larga'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  v_amount := round(p_amount, 2);

  insert into public.transactions (user_id, type, amount, category, note, occurred_on)
  values (v_uid, 'income', v_amount, 'Ingreso', nullif(p_note, ''), v_date)
  returning id into v_income;

  select coalesce(saving_pct, 0) into v_pct from public.settings where user_id = v_uid;
  v_saving := round(v_amount * coalesce(v_pct, 0) / 100, 2);

  if v_saving > 0 then
    insert into public.transactions (user_id, type, amount, category, income_id, occurred_on)
    values (v_uid, 'saving', v_saving, 'Ahorro', v_income, v_date);
  end if;

  return jsonb_build_object('saving', v_saving, 'net', v_amount - v_saving);
end;
$$;

-- --------------------------------------------- 2. pagar las deudas del mes
-- Paga la cuota (o el saldo, si es menor) de cada deuda activa que todavía no tenga un pago este mes.
create or replace function public.pay_month_debts(p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_date      date := coalesce(p_date, current_date);
  v_available numeric;
  v_total     numeric := 0;
  d           record;
  pay         numeric;
  payments    jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'Debés iniciar sesión'; end if;
  if abs(v_date - current_date) > 1 then raise exception 'Fecha inválida'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  select coalesce(sum(case when type = 'income' then amount else -amount end), 0)
    into v_available from public.transactions where user_id = v_uid;

  select coalesce(sum(least(db.installment, db.balance)), 0) into v_total
    from public.debts db
   where db.user_id = v_uid and db.balance > 0
     and not exists (
       select 1 from public.transactions t
        where t.debt_id = db.id and t.type = 'debt_payment'
          and date_trunc('month', t.occurred_on) = date_trunc('month', v_date));

  if v_total <= 0 then raise exception 'No hay cuotas pendientes este mes'; end if;
  if v_total > v_available then raise exception 'Saldo insuficiente para pagar las deudas del mes'; end if;

  for d in
    select * from public.debts x
     where x.user_id = v_uid and x.balance > 0
       and not exists (
         select 1 from public.transactions t
          where t.debt_id = x.id and t.type = 'debt_payment'
            and date_trunc('month', t.occurred_on) = date_trunc('month', v_date))
     order by x.created_at
  loop
    pay := least(d.installment, d.balance);
    update public.debts set balance = balance - pay where id = d.id;
    insert into public.transactions (user_id, type, amount, category, note, debt_id, occurred_on)
    values (v_uid, 'debt_payment', pay, 'Deuda', d.name, d.id, v_date);
    payments := payments || jsonb_build_object('debt_id', d.id, 'name', d.name, 'amount', pay);
  end loop;

  return jsonb_build_object('total', v_total, 'payments', payments);
end;
$$;

revoke execute on function public.pay_month_debts(date) from public, anon;
grant execute on function public.pay_month_debts(date) to authenticated;
revoke execute on function public.register_income(numeric, text, date) from public, anon;
grant execute on function public.register_income(numeric, text, date) to authenticated;

-- ------------------------------------------------- 3. borrar movimientos
--  * Gasto: devuelve el dinero al disponible.
--  * Ingreso: se van con él su ahorro y las cuotas que descontó (versiones anteriores), siempre que el
--    dinero neto de ese ingreso no se haya gastado ya.
--  * Pago de deuda manual: restaura el saldo de la deuda. Si nació de un ingreso (versiones anteriores),
--    se elimina junto con ese ingreso.
create or replace function public.delete_transaction(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  t           public.transactions;
  v_taken     numeric;
  v_available numeric;
begin
  if v_uid is null then raise exception 'Debés iniciar sesión'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  select * into t from public.transactions where id = p_id and user_id = v_uid;
  if not found then raise exception 'Movimiento no encontrado'; end if;

  if t.income_id is not null then
    raise exception 'Este movimiento se elimina junto con el ingreso que lo generó';
  end if;

  if t.type = 'income' then
    select coalesce(sum(amount), 0) into v_taken
      from public.transactions where income_id = t.id and user_id = v_uid;

    select coalesce(sum(case when type = 'income' then amount else -amount end), 0)
      into v_available from public.transactions where user_id = v_uid;

    if v_available - (t.amount - v_taken) < 0 then
      raise exception 'No podés eliminar este ingreso: ya gastaste ese dinero';
    end if;

    update public.debts d
    set balance = least(d.total, d.balance + p.amt)
    from (select debt_id, sum(amount) as amt
            from public.transactions
           where income_id = t.id and user_id = v_uid and type = 'debt_payment' and debt_id is not null
           group by debt_id) p
    where d.id = p.debt_id and d.user_id = v_uid;

  elsif t.type = 'debt_payment' and t.debt_id is not null then
    update public.debts set balance = least(total, balance + t.amount)
     where id = t.debt_id and user_id = v_uid;
  end if;

  delete from public.transactions where id = t.id and user_id = v_uid;  -- ahorro y cuotas ligadas caen por cascade
end;
$$;

revoke execute on function public.delete_transaction(uuid) from public, anon;
grant execute on function public.delete_transaction(uuid) to authenticated;

-- ----------------------------------------------------- 4. vista de control
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
                    when t.type in ('expense', 'debt_payment', 'saving') then -t.amount end), 0) as balance,
  count(t.id)                                                               as movements,
  max(t.created_at)                                                         as last_movement_at,
  coalesce(sum(t.amount) filter (where t.type = 'saving'), 0)               as total_saved
from public.profiles p
left join auth.users u          on u.id = p.id
left join public.transactions t on t.user_id = p.id
group by p.id, p.email, p.created_at, u.last_sign_in_at;

revoke all on public.admin_users from public, anon, authenticated;
