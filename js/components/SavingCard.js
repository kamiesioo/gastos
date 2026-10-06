import { html } from '../deps.js';
import { money, monthLabel } from '../format.js';
import { Icon } from './Icons.js';

export function SavingCard({ pct, status, month, monthIncome, monthSaving, onChange }) {
  const set = (raw) => onChange(Math.min(100, Math.max(0, Math.round(parseFloat(raw) || 0))));

  let summary;
  if (!(pct > 0)) summary = html`<p className="muted">Indicá qué porcentaje de cada ingreso querés ahorrar: se descuenta de tu saldo.</p>`;
  else if (monthIncome <= 0) summary = html`<p className="muted">Con cada ingreso se apartará el ${pct}% para ahorro y se descontará de tu saldo.</p>`;
  else
    summary = html`
      <div className="saving-result">
        <small>Ingresos de ${monthLabel(month)}: ${money(monthIncome)}</small>
        <strong>Ahorrado ${money(monthSaving)}</strong>
        <small>Se aparta el ${pct}% de los ingresos del mes y se descuenta de tu saldo; si cambiás el % se recalcula.</small>
      </div>`;

  return html`
    <section className="card">
      <div className="card-title"><span className="card-icon"><${Icon} name="piggy" size=${18} /></span><h2>Meta de ahorro</h2></div>
      <div className="saving-input">
        <input type="range" min="0" max="100" step="1" value=${pct} onChange=${(e) => set(e.target.value)} aria-label="Porcentaje de ahorro" style=${{ '--p': pct + '%' }} />
        <label className="pct">
          <input type="number" min="0" max="100" step="1" inputMode="numeric" placeholder="0" value=${pct || ''} onChange=${(e) => set(e.target.value)} aria-label="Porcentaje de ahorro" />
          <span>%</span>
        </label>
      </div>
      <small className="muted status" aria-live="polite">${status}</small>
      ${summary}
    </section>`;
}
