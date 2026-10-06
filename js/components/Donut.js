import { html, useState, useMemo } from '../deps.js';
import { useDrawn } from '../hooks.js';
import { money } from '../format.js';

const GAP = 0.8; // separación visual entre porciones (en % del anillo)

export function Donut({ month, summary, hasAnyData }) {
  const [active, setActive] = useState(null);

  const slices = useMemo(
    () => [
      { key: 'available', label: 'Ingresos netos disponibles', short: 'Disponible', value: Math.max(summary.available, 0), color: 'var(--green)' },
      { key: 'expense', label: 'Egresos / gastos', short: 'Gastos', value: summary.expense, color: 'var(--red)' },
      { key: 'debt', label: 'Pago de deudas', short: 'Deudas', value: summary.debtPaid, color: 'var(--blue)' },
      { key: 'saving', label: 'Ahorro', short: 'Ahorro', value: summary.saving, color: 'var(--yellow)' },
    ],
    [summary],
  );

  const total = slices.reduce((a, s) => a + s.value, 0);
  const drawn = useDrawn(`${month}:${total > 0}`);

  if (total === 0) {
    return html`<p className="empty">${hasAnyData ? 'Sin movimientos en este mes.' : 'Registrá tu primer ingreso y acá verás tu gráfico.'}</p>`;
  }

  let acc = 0;
  const arcs = slices.map((s) => {
    const pct = (s.value / total) * 100;
    const arc = { ...s, pct, start: acc };
    acc += pct;
    return arc;
  });
  const visible = arcs.filter((a) => a.pct > 0);
  const gap = visible.length > 1 ? GAP : 0;
  const focus = arcs.find((a) => a.key === active);
  const centerValue = money(focus ? focus.value : summary.income);

  return html`
    <div className="chart">
      <div className="donut-wrap">
        <svg className="donut" viewBox="0 0 42 42" role="img" aria-label="Distribución de los ingresos del mes">
          <g transform="rotate(-90 21 21)">
            <circle cx="21" cy="21" r="15.9155" fill="none" strokeWidth="4" className="donut-track" />
            ${visible.map(
              (a, i) => html`
                <circle
                  key=${a.key}
                  cx="21" cy="21" r="15.9155" fill="none" pathLength="100"
                  className=${'donut-arc' + (focus && focus.key !== a.key ? ' dim' : '') + (focus && focus.key === a.key ? ' hot' : '')}
                  style=${{
                    stroke: a.color,
                    strokeDasharray: drawn ? `${Math.max(a.pct - gap, 0.01)} 100` : '0 100',
                    strokeDashoffset: -(a.start + gap / 2),
                    transitionDelay: drawn ? `${i * 140}ms` : '0ms',
                  }}
                  onMouseEnter=${() => setActive(a.key)}
                  onMouseLeave=${() => setActive(null)}
                />`,
            )}
          </g>
        </svg>
        <div className="donut-center" aria-live="polite">
          <small>${focus ? focus.short : 'Ingresos del mes'}</small>
          <strong className=${centerValue.length > 10 ? 'sm' : ''}>${centerValue}</strong>
          ${focus && html`<small>${Math.round(focus.pct)}% del total</small>`}
        </div>
      </div>

      <ul className="legend">
        ${arcs.map(
          (a) => html`
            <li key=${a.key}>
              <button type="button" className=${'legend-item' + (active === a.key ? ' on' : '')}
                      onMouseEnter=${() => setActive(a.key)} onMouseLeave=${() => setActive(null)}
                      onFocus=${() => setActive(a.key)} onBlur=${() => setActive(null)}
                      onClick=${() => setActive(active === a.key ? null : a.key)}>
                <i style=${{ background: a.color }}></i>
                <span>${a.label}</span>
                <b>${money(a.value)} <em>${Math.round(a.pct)}%</em></b>
              </button>
            </li>`,
        )}
      </ul>
    </div>`;
}
