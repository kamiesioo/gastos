import { html, useState, useMemo } from '../deps.js';
import { monthOf } from '../finance.js';
import { money, dateLabel } from '../format.js';
import { Icon } from './Icons.js';

const PREVIEW = 6;

const KIND = {
  income: { icon: 'arrowUp', cls: 'income', sign: '+' },
  expense: { icon: 'arrowDown', cls: 'expense', sign: '-' },
  debt_payment: { icon: 'minus', cls: 'debt', sign: '-' },
  saving: { icon: 'piggy', cls: 'saving', sign: '-' },
};

function Row({ t, kids, confirming, busy, onAskDelete, onCancel, onConfirm }) {
  const k = KIND[t.type];
  const title = t.type === 'debt_payment' ? `Cuota · ${t.note}` : t.category || 'Ingreso';
  const sub = t.type === 'debt_payment' || t.type === 'saving' ? null : t.note;
  const removable = !t.income_id;

  return html`
    <li className=${'tx' + (confirming ? ' confirming' : '')}>
      <div className="tx-main">
        <span className=${'tx-icon ' + k.cls}><${Icon} name=${k.icon} size=${16} /></span>
        <div className="tx-what">
          <div className="tx-title">${title}</div>
          <small>${dateLabel(t.occurred_on)}${sub ? ' · ' + sub : ''}</small>
        </div>
        <span className=${'amount ' + k.cls}>${k.sign}${money(t.amount)}</span>
        ${removable &&
        html`<button type="button" className="icon-btn danger" onClick=${onAskDelete} aria-label="Eliminar movimiento" title="Eliminar"><${Icon} name="trash" size=${16} /></button>`}
      </div>

      ${kids.map(
        (c) => html`
          <div className="tx-kid" key=${c.id}>
            <span>${c.type === 'saving' ? 'Ahorro' : `Cuota · ${c.note}`}</span><span className=${'amount ' + KIND[c.type].cls}>-${money(c.amount)}</span>
          </div>`,
      )}

      ${confirming &&
      html`
        <div className="confirm" role="alertdialog">
          <span>${t.type === 'income' && kids.length ? '¿Eliminar este ingreso? Se quitan también su ahorro y cuotas descontadas.' : t.type === 'debt_payment' ? '¿Eliminar este pago? La deuda recupera su saldo.' : '¿Eliminar este movimiento?'}</span>
          <div>
            <button type="button" className="btn small danger-solid" disabled=${busy} onClick=${onConfirm}>${busy ? 'Eliminando…' : 'Eliminar'}</button>
            <button type="button" className="btn small ghost" disabled=${busy} onClick=${onCancel}>Cancelar</button>
          </div>
        </div>`}
    </li>`;
}

export function History({ txs, month, onDelete }) {
  const [showAll, setShowAll] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Los pagos de cuota se muestran dentro del ingreso que los generó.
  const rows = useMemo(() => {
    const inMonth = txs.filter((t) => monthOf(t.occurred_on) === month);
    const parentIds = new Set(inMonth.filter((t) => !t.income_id).map((t) => t.id));
    const isKid = (t) => t.income_id && parentIds.has(t.income_id);
    const kids = new Map();
    for (const t of inMonth) {
      if (isKid(t)) {
        kids.set(t.income_id, [...(kids.get(t.income_id) || []), t]);
      }
    }
    return inMonth
      .filter((t) => !isKid(t))
      .map((t) => ({ t, kids: kids.get(t.id) || [] }));
  }, [txs, month]);

  const shown = showAll ? rows : rows.slice(0, PREVIEW);

  const confirm = async (id) => {
    setBusyId(id);
    await onDelete(id); // Dashboard muestra el error si falla
    setBusyId(null);
    setConfirmId(null);
  };

  return html`
    <section className="card">
      <h2>Movimientos</h2>
      ${rows.length === 0
        ? html`<p className="empty">Todavía no hay movimientos este mes.</p>`
        : html`<ul className="history">
            ${shown.map(
              ({ t, kids }) => html`<${Row} key=${t.id} t=${t} kids=${kids}
                confirming=${confirmId === t.id} busy=${busyId === t.id}
                onAskDelete=${() => setConfirmId(t.id)} onCancel=${() => setConfirmId(null)} onConfirm=${() => confirm(t.id)} />`,
            )}
          </ul>`}
      ${rows.length > PREVIEW &&
      html`<button className="btn link" type="button" onClick=${() => setShowAll(!showAll)}>${showAll ? 'Ver menos' : `Ver todos (${rows.length})`}</button>`}
    </section>`;
}
