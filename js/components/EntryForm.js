import { html, useState, useEffect, useRef } from '../deps.js';
import { savingTarget, round2 } from '../finance.js';
import { CATEGORIES, money } from '../format.js';
import { Icon } from './Icons.js';

export function EntryForm({ type, savingPct, available, onSubmit, onCancel }) {
  const income = type === 'income';
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const amountRef = useRef(null);

  useEffect(() => amountRef.current?.focus(), []);

  const n = round2(parseFloat(amount));
  const valid = Number.isFinite(n) && n > 0;

  let hint = null;
  if (valid && income) {
    const saving = savingTarget(n, savingPct);
    hint = saving > 0 ? `Se apartarán ${money(saving)} para ahorro (${savingPct}%) · te quedan ${money(round2(n - saving))}.` : null;
  } else if (valid) {
    hint = n > available ? `Supera tu saldo disponible (${money(available)}).` : `Te quedarán ${money(available - n)} disponibles.`;
  }
  const warn = valid && !income && n > available;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return setError('Ingresá un monto mayor a cero.');
    setError('');
    setBusy(true);
    try {
      await onSubmit({ type, amount: n, category, note: note.trim() });
    } catch (err) {
      setError(err.message || 'No se pudo guardar.');
      setBusy(false);
    }
  };

  return html`
    <form className=${'card entry reveal ' + type} onSubmit=${submit} noValidate onKeyDown=${(e) => e.key === 'Escape' && onCancel()}>
      <div className="entry-head">
        <h2>${income ? 'Nuevo ingreso' : 'Nuevo gasto'}</h2>
        <button type="button" className="icon-btn" onClick=${onCancel} aria-label="Cerrar"><${Icon} name="x" size=${18} /></button>
      </div>

      <div className="amount-field">
        <span>$</span>
        <input ref=${amountRef} type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0" aria-label="Monto"
               value=${amount} onChange=${(e) => setAmount(e.target.value)} />
      </div>

      ${!income &&
      html`
        <div className="chips" role="radiogroup" aria-label="Categoría">
          ${CATEGORIES.map(
            (c) => html`
              <button key=${c} type="button" role="radio" aria-checked=${category === c}
                      className=${'chip' + (category === c ? ' on' : '')} onClick=${() => setCategory(c)}>${c}</button>`,
          )}
        </div>`}

      <input type="text" maxLength="80" placeholder="Nota (opcional)" aria-label="Nota" value=${note} onChange=${(e) => setNote(e.target.value)} />

      ${hint && html`<p className=${'hint' + (warn ? ' warn' : '')}>${hint}</p>`}
      ${error && html`<p className="error" role="alert">${error}</p>`}

      <div className="row">
        <button className="btn primary" type="submit" disabled=${busy}>${busy ? 'Guardando…' : income ? 'Registrar ingreso' : 'Registrar gasto'}</button>
        <button className="btn ghost" type="button" onClick=${onCancel}>Cancelar</button>
      </div>
    </form>`;
}
