// Reglas de negocio puras (sin DOM ni red).

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Cuotas del mes que todavía no se pagaron: una por deuda activa que no tenga ya un pago en `ym`.
 * Nunca incluye más que el saldo de la deuda.
 */
export function dueDebts(debts, txs, ym) {
  const paidThisMonth = new Set(
    txs.filter((t) => t.type === 'debt_payment' && t.debt_id && monthOf(t.occurred_on) === ym).map((t) => t.debt_id),
  );
  const payments = debts
    .filter((d) => d.balance > 0 && !paidThisMonth.has(d.id))
    .map((d) => ({ debt_id: d.id, name: d.name, amount: round2(Math.min(d.installment, d.balance)) }));
  return { payments, total: round2(payments.reduce((a, p) => a + p.amount, 0)) };
}

export const savingTarget = (amount, pct) => round2((amount * pct) / 100);

export function summarize(txs) {
  const sum = (type) => round2(txs.filter((t) => t.type === type).reduce((a, t) => a + t.amount, 0));
  const income = sum('income');
  const expense = sum('expense');
  const debtPaid = sum('debt_payment');
  const saving = sum('saving');
  return { income, expense, debtPaid, saving, available: round2(income - expense - debtPaid - saving) };
}

export const monthOf = (isoDate) => isoDate.slice(0, 7);

export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
