import { html } from '../deps.js';
import { savingTarget } from '../finance.js';
import { money, monthLabel } from '../format.js';
import { Icon } from './Icons.js';

export function SavingCard({ pct, status, month, monthIncome, onChange }) {
  const set = (raw) => onChange(Math.min(100, Math.max(0, Math.round(parseFloat(raw) || 0))));

  let summary;
  if (!(pct > 0)) summary = html`<p className="muted">Indicá qué porcentaje de tus ingresos querés ahorrar.</p>`;
  else if (monthIncome <= 0) summary = html`<p className="muted">Cuando registres un ingreso, acá verás cuánto corresponde ahorrar con ${pct}%.</p>`;
  else
    summary = html`
      <div className="saving-result">
        <small>Ingresos de ${monthLabel(month)}: ${money(monthIncome)}</small>
        <strong>Ahorrá ${money(savingTarget(monthIncome, pct))}</strong>
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
