// Reglas de negocio puras (sin DOM ni red).

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Reparte un ingreso entre las cuotas de las deudas activas.
 * Nunca descuenta más que el saldo de la deuda ni más de lo que ingresó.
 */
export function planIncome(debts, amount) {
  const payments = [];
  let remaining = amount;
  for (const d of debts) {
    if (d.balance <= 0) continue;
    const pay = round2(Math.min(d.installment, d.balance, remaining));
    if (pay <= 0) continue;
    payments.push({ debt_id: d.id, name: d.name, amount: pay });
    remaining = round2(remaining - pay);
  }
  return { payments, net: remaining, debtPaid: round2(amount - remaining) };
}

export const savingTarget = (amount, pct) => round2((amount * pct) / 100);

export function summarize(txs) {
  const sum = (type) => round2(txs.filter((t) => t.type === type).reduce((a, t) => a + t.amount, 0));
  const income = sum('income');
  const expense = sum('expense');
  const debtPaid = sum('debt_payment');
  return { income, expense, debtPaid, available: round2(income - expense - debtPaid) };
}

export const monthOf = (isoDate) => isoDate.slice(0, 7);

export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
