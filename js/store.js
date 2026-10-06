import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { SUPABASE_ESM } from './deps.js';
import { dueDebts, round2, savingTarget, summarize, monthOf } from './finance.js';

export const isDemo = !SUPABASE_URL || !SUPABASE_ANON_KEY;

export const createStore = () => (isDemo ? createLocalStore() : createSupabaseStore());

const byNewest = (a, b) =>
  b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at);

// ---------------------------------------------------------------- Supabase

async function createSupabaseStore() {
  const { createClient } = await import(SUPABASE_ESM);
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const unwrap = ({ data, error }) => {
    if (error) throw new Error(authMessage(error.message));
    return data;
  };

  const authMessage = (msg) =>
    ({
      'Invalid login credentials': 'Email o contraseña incorrectos.',
      'Email not confirmed': 'Confirmá tu email antes de ingresar (revisá tu bandeja).',
      'User already registered': 'Ya existe una cuenta con ese email.',
    })[msg] ||
    (/rate limit/i.test(msg) ? 'Demasiados intentos. Esperá unos minutos y probá de nuevo.' : msg);

  return {
    async getUser() {
      const { data } = await sb.auth.getSession();
      return data.session?.user ?? null;
    },
    async signIn(email, password) {
      return unwrap(await sb.auth.signInWithPassword({ email, password })).user;
    },
    async signUp(email, password) {
      const data = unwrap(await sb.auth.signUp({ email, password }));
      // Con confirmación de email activa, Supabase devuelve el usuario pero sin sesión.
      return { user: data.session ? data.user : null, needsConfirm: !data.session };
    },
    async signOut() {
      unwrap(await sb.auth.signOut());
    },

    async load() {
      const [debts, transactions, settings] = await Promise.all([
        sb.from('debts').select('*').order('created_at').then(unwrap),
        sb.from('transactions').select('*').then(unwrap),
        sb.from('settings').select('saving_pct').maybeSingle().then(unwrap),
      ]);
      return {
        debts: debts.map((d) => ({ ...d, total: +d.total, balance: +d.balance, installment: +d.installment })),
        transactions: transactions.map((t) => ({ ...t, amount: +t.amount })).sort(byNewest),
        savingPct: settings ? +settings.saving_pct : 0,
      };
    },

    async addIncome({ amount, note, date }) {
      return unwrap(await sb.rpc('register_income', { p_amount: amount, p_note: note || null, p_date: date }));
    },
    // Las tablas son de sólo lectura para el cliente: toda escritura pasa por funciones
    // que validan en el servidor (ver supabase/schema.sql).
    async addExpense({ amount, category, note, date }) {
      unwrap(await sb.rpc('register_expense', { p_amount: amount, p_category: category, p_note: note || null, p_date: date }));
    },
    async deleteTransaction(id) {
      unwrap(await sb.rpc('delete_transaction', { p_id: id }));
    },
    async payMonthDebts({ date }) {
      return unwrap(await sb.rpc('pay_month_debts', { p_date: date }));
    },
    async addDebt({ name, total, installment }) {
      unwrap(await sb.rpc('add_debt', { p_name: name, p_total: total, p_installment: installment }));
    },
    async deleteDebt(id) {
      unwrap(await sb.rpc('delete_debt', { p_id: id }));
    },
    async saveSavingPct(pct) {
      unwrap(await sb.rpc('set_saving_pct', { p_pct: pct }));
    },
  };
}

// ------------------------------------------------- Demo (localStorage, sin red)

function createLocalStore() {
  const KEY = 'gastos-demo-v1';
  const read = () =>
    JSON.parse(localStorage.getItem(KEY) || 'null') || { user: null, debts: [], transactions: [], savingPct: 0 };
  const write = (s) => localStorage.setItem(KEY, JSON.stringify(s));
  const id = () => crypto.randomUUID();
  const now = () => new Date().toISOString();

  return {
    async getUser() {
      return read().user;
    },
    async signIn(email) {
      const s = read();
      s.user = { id: 'demo', email };
      write(s);
      return s.user;
    },
    async signUp(email) {
      return { user: await this.signIn(email), needsConfirm: false };
    },
    async signOut() {
      const s = read();
      s.user = null;
      write(s);
    },

    async load() {
      const s = read();
      return { debts: s.debts, transactions: [...s.transactions].sort(byNewest), savingPct: s.savingPct };
    },

    async addIncome({ amount, note, date }) {
      const s = read();
      const incomeId = id();
      const saving = savingTarget(amount, s.savingPct);
      s.transactions.push({ id: incomeId, type: 'income', amount, category: 'Ingreso', note, occurred_on: date, created_at: now() });
      if (saving > 0) {
        s.transactions.push({ id: id(), type: 'saving', amount: saving, category: 'Ahorro', note: null, income_id: incomeId, occurred_on: date, created_at: now() });
      }
      write(s);
      return { saving, net: round2(amount - saving) };
    },
    async payMonthDebts({ date }) {
      const s = read();
      const due = dueDebts(s.debts, s.transactions, monthOf(date));
      if (due.total <= 0) throw new Error('No hay cuotas pendientes este mes');
      if (due.total > summarize(s.transactions).available) throw new Error('Saldo insuficiente para pagar las deudas del mes');
      for (const p of due.payments) {
        const debt = s.debts.find((d) => d.id === p.debt_id);
        debt.balance = round2(debt.balance - p.amount);
        s.transactions.push({ id: id(), type: 'debt_payment', amount: p.amount, category: 'Deuda', note: p.name, debt_id: p.debt_id, income_id: null, occurred_on: date, created_at: now() });
      }
      write(s);
      return { total: due.total, payments: due.payments };
    },
    async addExpense({ amount, category, note, date }) {
      const s = read();
      s.transactions.push({ id: id(), type: 'expense', amount, category, note, occurred_on: date, created_at: now() });
      write(s);
    },
    // Mismas reglas que delete_transaction() en supabase/migrations/003.
    async deleteTransaction(txId) {
      const s = read();
      const t = s.transactions.find((x) => x.id === txId);
      if (!t) throw new Error('Movimiento no encontrado');
      if (t.income_id) throw new Error('Este movimiento se elimina junto con el ingreso que lo generó');

      const restore = (p) => {
        const debt = s.debts.find((d) => d.id === p.debt_id);
        if (debt) debt.balance = round2(Math.min(debt.total, debt.balance + p.amount));
      };
      if (t.type === 'income') {
        const children = s.transactions.filter((x) => x.income_id === t.id);
        const taken = children.reduce((a, p) => a + p.amount, 0);
        if (summarize(s.transactions).available - (t.amount - taken) < 0) {
          throw new Error('No podés eliminar este ingreso: ya gastaste ese dinero');
        }
        children.filter((p) => p.type === 'debt_payment').forEach(restore);
      } else if (t.type === 'debt_payment') {
        restore(t);
      }
      s.transactions = s.transactions.filter((x) => x.id !== t.id && x.income_id !== t.id);
      write(s);
    },
    async addDebt({ name, total, installment }) {
      const s = read();
      s.debts.push({ id: id(), name, total, balance: total, installment, created_at: now() });
      write(s);
    },
    async deleteDebt(debtId) {
      const s = read();
      s.debts = s.debts.filter((d) => d.id !== debtId);
      write(s);
    },
    async saveSavingPct(pct) {
      const s = read();
      const ym = monthOf(now());
      const month = s.transactions.filter((t) => t.type === 'income' && monthOf(t.occurred_on) === ym);
      const rest = s.transactions.filter((t) => !(t.type === 'saving' && month.some((i) => i.id === t.income_id)));
      const resaved = month
        .map((i) => ({ i, saving: savingTarget(i.amount, pct) }))
        .filter((x) => x.saving > 0)
        .map(({ i, saving }) => ({ id: id(), type: 'saving', amount: saving, category: 'Ahorro', note: null, income_id: i.id, occurred_on: i.occurred_on, created_at: now() }));
      const next = [...rest, ...resaved];
      if (summarize(next).available < 0) throw new Error('Con ese porcentaje el saldo quedaría en negativo');
      s.savingPct = pct;
      s.transactions = next;
      write(s);
    },
  };
}
