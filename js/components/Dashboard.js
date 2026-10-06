import { html, useState, useEffect, useMemo, useRef, useCallback } from '../deps.js';
import { summarize, monthOf, shiftMonth, round2 } from '../finance.js';
import { money, monthLabel, todayISO } from '../format.js';
import { useCountUp } from '../hooks.js';
import { Icon, Logo } from './Icons.js';
import { Donut } from './Donut.js';
import { EntryForm } from './EntryForm.js';
import { History } from './History.js';
import { SavingCard } from './SavingCard.js';
import { Debts } from './Debts.js';

function Hero({ available, month, debtBalance, onEntry }) {
  const shown = useCountUp(available);
  return html`
    <section className="hero reveal">
      <span className="hero-label">Disponible para gastar</span>
      <strong className=${'hero-amount' + (available < 0 ? ' neg' : '')}>${money(Math.round(shown * 100) / 100)}</strong>
      <div className="hero-stats">
        <span><small>Ingresos del mes</small><b>${money(month.income)}</b></span>
        <span><small>Gastos del mes</small><b>${money(month.expense)}</b></span>
        ${debtBalance > 0 && html`<span><small>Deuda pendiente</small><b>${money(debtBalance)}</b></span>`}
      </div>
      <div className="hero-actions">
        <button type="button" className="btn light" onClick=${() => onEntry('income')}><${Icon} name="plus" size=${18} /> Ingreso</button>
        <button type="button" className="btn glass" onClick=${() => onEntry('expense')}><${Icon} name="minus" size=${18} /> Gasto</button>
      </div>
    </section>`;
}

function Notice({ notice, savingPct, onClose }) {
  const saving = notice.saving;
  return html`
    <div className="notice reveal" role="status">
      <span className="notice-icon"><${Icon} name=${saving ? 'piggy' : 'check'} size=${20} /></span>
      <div>
        ${saving
          ? html`<strong>Debes mover ${money(saving)} a tu plazo fijo / inversión</strong>
                 <p>Es el ${savingPct}% de tu ingreso de ${money(notice.amount)}; ya se descontó de tu saldo.</p>`
          : html`<strong>Ingreso de ${money(notice.amount)} registrado</strong>`}
      </div>
      <button type="button" className="icon-btn" onClick=${onClose} aria-label="Cerrar aviso"><${Icon} name="x" size=${18} /></button>
    </div>`;
}

function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(onClose, 3500);
    return () => clearTimeout(id);
  }, [toast]);
  return toast ? html`<div key=${toast.id} className=${'toast' + (toast.error ? ' err' : '')} role="status">${toast.message}</div>` : null;
}

export function Dashboard({ store, user, onLogout }) {
  const [data, setData] = useState({ debts: [], txs: [] });
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [entry, setEntry] = useState(null);
  const [notice, setNotice] = useState(null);
  const [toast, setToast] = useState(null);

  const [savingPct, setSavingPct] = useState(0);
  const [saveStatus, setSaveStatus] = useState('');
  const pctRef = useRef(0);
  const dirty = useRef(false);
  const timer = useRef(null);

  const notify = useCallback((message, error = false) => setToast({ message, error, id: Date.now() }), []);

  const refresh = useCallback(async () => {
    const d = await store.load();
    setData({ debts: d.debts, txs: d.transactions });
    if (!dirty.current) {
      pctRef.current = d.savingPct;
      setSavingPct(d.savingPct); // no pisar un % que todavía no se guardó
    }
  }, [store]);

  useEffect(() => {
    refresh().catch((err) => notify(err.message, true));
  }, [refresh]);

  // ---- meta de ahorro: se recalcula al escribir y se guarda al dejar de teclear
  const persistPct = async () => {
    timer.current = null;
    try {
      await store.saveSavingPct(pctRef.current);
      if (!timer.current) dirty.current = false;
      setSaveStatus('Guardado ✓');
    } catch (err) {
      setSaveStatus('');
      notify(err.message, true);
    }
  };

  const changePct = (pct) => {
    pctRef.current = pct;
    dirty.current = true;
    setSavingPct(pct);
    setSaveStatus('Guardando…');
    clearTimeout(timer.current);
    timer.current = setTimeout(persistPct, 600);
  };

  const logout = async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      await persistPct(); // guardar antes de perder la sesión
    }
    await onLogout();
  };

  // ---- acciones
  const guarded = (fn, okMessage) => async (...args) => {
    try {
      await fn(...args);
      await refresh();
      if (okMessage) notify(okMessage);
    } catch (err) {
      notify(err.message, true);
    }
  };

  const submitEntry = async ({ type, amount, category, note }) => {
    const date = todayISO();
    if (type === 'income') {
      if (timer.current) {
        clearTimeout(timer.current);
        await persistPct(); // el ahorro se calcula en el servidor con el % ya guardado
      }
      const result = await store.addIncome({ amount, note, date });
      setNotice({ amount, saving: round2(result.saving), id: Date.now() });
    } else {
      if (amount > summarize(data.txs).available) throw new Error('Saldo insuficiente para este gasto.');
      await store.addExpense({ amount, category, note, date });
      notify('Gasto registrado');
    }
    setMonth(monthOf(date));
    setEntry(null);
    await refresh();
  };

  const removeTx = guarded((id) => store.deleteTransaction(id), 'Movimiento eliminado');
  const addDebt = async (debt) => {
    await store.addDebt(debt);
    await refresh();
    notify('Deuda agregada');
  };
  const payMonthDebts = async () => {
    try {
      const result = await store.payMonthDebts({ date: todayISO() });
      await refresh();
      notify(`Deuda del mes pagada: ${money(result.total)}`);
    } catch (err) {
      notify(err.message, true);
    }
  };
  const removeDebt = guarded((id) => store.deleteDebt(id), 'Deuda eliminada');

  // ---- derivados
  const all = useMemo(() => summarize(data.txs), [data.txs]);
  const monthSummary = useMemo(() => summarize(data.txs.filter((t) => monthOf(t.occurred_on) === month)), [data.txs, month]);
  const debtBalance = useMemo(() => round2(data.debts.reduce((a, d) => a + d.balance, 0)), [data.debts]);

  return html`
    <div className="app">
      <header className="topbar">
        <div className="brand"><${Logo} size=${30} /><span>Finanzas Korion</span></div>
        <div className="topbar-right">
          <span className="user-chip" title=${user.email}>${user.email}</span>
          <button type="button" className="btn ghost small" onClick=${logout}><${Icon} name="logout" size=${16} /> Salir</button>
        </div>
      </header>

      <main className="layout">
        ${notice && html`<${Notice} key=${notice.id} notice=${notice} savingPct=${savingPct} onClose=${() => setNotice(null)} />`}

        <div className="grid">
          <div className="col">
            <${Hero} available=${all.available} month=${monthSummary} debtBalance=${debtBalance} onEntry=${setEntry} />

            ${entry &&
            html`<${EntryForm} key=${entry} type=${entry} savingPct=${savingPct} available=${all.available}
                   onSubmit=${submitEntry} onCancel=${() => setEntry(null)} />`}

            <section className="card">
              <div className="month-nav">
                <button type="button" className="icon-btn" onClick=${() => setMonth(shiftMonth(month, -1))} aria-label="Mes anterior"><${Icon} name="chevron" size=${20} /></button>
                <span>${monthLabel(month)}</span>
                <button type="button" className="icon-btn" onClick=${() => setMonth(shiftMonth(month, 1))} aria-label="Mes siguiente"><${Icon} name="chevron" size=${20} /></button>
              </div>
              <${Donut} month=${month} summary=${monthSummary} hasAnyData=${data.txs.length > 0} />
            </section>
          </div>

          <div className="col">
            <${SavingCard} pct=${savingPct} status=${saveStatus} month=${month} monthIncome=${monthSummary.income} monthSaving=${monthSummary.saving} onChange=${changePct} />
            <${History} txs=${data.txs} month=${month} onDelete=${removeTx} />
            <${Debts} debts=${data.debts} txs=${data.txs} available=${all.available} onAdd=${addDebt} onDelete=${removeDebt} onPayMonth=${payMonthDebts} />
          </div>
        </div>
      </main>

      <${Toast} toast=${toast} onClose=${() => setToast(null)} />
    </div>`;
}
