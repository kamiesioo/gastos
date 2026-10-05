import { html, useState } from '../deps.js';
import { round2 } from '../finance.js';
import { money } from '../format.js';
import { Icon } from './Icons.js';

export function Debts({ debts, onAdd, onDelete }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [total, setTotal] = useState('');
  const [installment, setInstallment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const pending = round2(debts.reduce((a, d) => a + d.balance, 0));

  const submit = async (e) => {
    e.preventDefault();
    const t = round2(parseFloat(total));
    const i = round2(parseFloat(installment));
    if (!name.trim()) return setError('Poné un nombre a la deuda.');
    if (!(t > 0) || !(i > 0)) return setError('Ingresá montos mayores a cero.');
    if (i > t) return setError('La cuota no puede superar el total de la deuda.');
    setError('');
    setBusy(true);
    try {
      await onAdd({ name: name.trim(), total: t, installment: i });
      setName('');
      setTotal('');
      setInstallment('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return html`
    <section className="card">
      <button type="button" className="collapse" aria-expanded=${open} onClick=${() => setOpen(!open)}>
        <span className="card-title"><span className="card-icon"><${Icon} name="card" size=${18} /></span><h2>Deudas</h2></span>
        <span className="collapse-meta">${debts.length ? money(pending) : 'Sin deudas'}<${Icon} name="chevron" size=${18} /></span>
      </button>

      ${open &&
      html`
        <div className="debts-body reveal">
          ${debts.length > 0 &&
          html`<ul className="debts">
            ${debts.map((d) => {
              const paid = Math.min(100, ((d.total - d.balance) / d.total) * 100);
              return html`
                <li key=${d.id}>
                  <div className="debt-top">
                    <strong>${d.name}</strong>
                    ${confirmId === d.id
                      ? html`<span>
                          <button type="button" className="btn small danger-solid" onClick=${() => (onDelete(d.id), setConfirmId(null))}>Eliminar</button>
                          <button type="button" className="btn small ghost" onClick=${() => setConfirmId(null)}>No</button>
                        </span>`
                      : html`<button type="button" className="icon-btn danger" onClick=${() => setConfirmId(d.id)} aria-label=${'Eliminar deuda ' + d.name}><${Icon} name="trash" size=${16} /></button>`}
                  </div>
                  <div className="bar" role="progressbar" aria-valuenow=${Math.round(paid)} aria-valuemin="0" aria-valuemax="100"><div style=${{ width: paid + '%' }}></div></div>
                  <small className="muted">Saldo ${money(d.balance)} de ${money(d.total)} · cuota ${money(d.installment)}</small>
                </li>`;
            })}
          </ul>`}

          <form className="stack" onSubmit=${submit} noValidate>
            <input type="text" maxLength="60" placeholder="Nueva deuda (ej. Préstamo)" aria-label="Nombre de la deuda" value=${name} onChange=${(e) => setName(e.target.value)} />
            <div className="row">
              <input type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="Total" aria-label="Monto total" value=${total} onChange=${(e) => setTotal(e.target.value)} />
              <input type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="Cuota mensual" aria-label="Cuota mensual" value=${installment} onChange=${(e) => setInstallment(e.target.value)} />
            </div>
            ${error && html`<p className="error" role="alert">${error}</p>`}
            <button className="btn" type="submit" disabled=${busy}>${busy ? 'Guardando…' : 'Agregar deuda'}</button>
          </form>
        </div>`}
    </section>`;
}
