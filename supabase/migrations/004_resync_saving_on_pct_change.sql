-- Migración 004 — ejecutar en Supabase → SQL Editor (después de 003). Se puede re-ejecutar.
--
-- Al cambiar el % de ahorro se recalcula el ahorro de los ingresos del mes en curso
-- (antes quedaba fijo con el % vigente al momento de ingresar el dinero).
-- Los meses anteriores no se tocan. Si el nuevo % dejaría el saldo en negativo, se rechaza.

create or replace function public.set_saving_pct(p_pct numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_pct     numeric;
  v_balance numeric;
begin
  if v_uid is null then raise exception 'Debés iniciar sesión'; end if;
  if p_pct is null or p_pct < 0 or p_pct > 100 then raise exception 'El porcentaje debe estar entre 0 y 100'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  v_pct := round(p_pct, 2);

  insert into public.settings (user_id, saving_pct) values (v_uid, v_pct)
  on conflict (user_id) do update set saving_pct = excluded.saving_pct;

  -- rehacer el ahorro de los ingresos del mes actual
  delete from public.transactions s
  using public.transactions i
  where s.type = 'saving' and s.user_id = v_uid
    and i.id = s.income_id and i.type = 'income'
    and date_trunc('month', i.occurred_on) = date_trunc('month', current_date);

  insert into public.transactions (user_id, type, amount, category, income_id, occurred_on)
  select v_uid, 'saving', round(i.amount * v_pct / 100, 2), 'Ahorro', i.id, i.occurred_on
  from public.transactions i
  where i.user_id = v_uid and i.type = 'income'
    and date_trunc('month', i.occurred_on) = date_trunc('month', current_date)
    and round(i.amount * v_pct / 100, 2) > 0;

  select coalesce(sum(case when type = 'income' then amount else -amount end), 0)
    into v_balance from public.transactions where user_id = v_uid;
  if v_balance < 0 then
    raise exception 'Con ese porcentaje el saldo quedaría en negativo';
  end if;
end;
$$;
