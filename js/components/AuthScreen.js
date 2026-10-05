import { html, useState } from '../deps.js';
import { Icon, Logo } from './Icons.js';

const FEATURES = [
  ['chart', 'Todo en un vistazo', 'Ingresos, gastos y deudas en un gráfico claro, mes a mes.'],
  ['card', 'Cuotas automáticas', 'Al ingresar dinero se descuentan solas las cuotas de tus deudas.'],
  ['shield', 'Datos solo tuyos', 'Cada cuenta está aislada: nadie más puede ver tus montos.'],
];

export function AuthScreen({ store, onAuth }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState(null);

  const signup = mode === 'signup';

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setConfirm('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const mail = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(mail)) return setError('Ingresá un email válido.');
    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
    if (signup && password !== confirm) return setError('Las contraseñas no coinciden.');

    setBusy(true);
    try {
      if (signup) {
        const { user, needsConfirm } = await store.signUp(mail, password);
        if (needsConfirm) return setSentTo(mail);
        onAuth(user);
      } else {
        onAuth(await store.signIn(mail, password));
      }
    } catch (err) {
      setError(err.message || 'No se pudo completar la operación.');
    } finally {
      setBusy(false);
    }
  };

  return html`
    <div className="auth-shell">
      <aside className="auth-aside">
        <div className="brand"><${Logo} size=${38} /><span>Finanzas Korion</span></div>
        <div className="auth-pitch">
          <h1>Tus finanzas,<br />claras y bajo control.</h1>
          <ul>
            ${FEATURES.map(
              ([icon, title, text]) => html`
                <li key=${title}>
                  <span className="feat-icon"><${Icon} name=${icon} size=${18} /></span>
                  <div><strong>${title}</strong><p>${text}</p></div>
                </li>`,
            )}
          </ul>
        </div>
      </aside>

      <main className="auth-main">
        ${sentTo
          ? html`
              <div className="auth-card reveal">
                <div className="sent-icon"><${Icon} name="check" size=${28} /></div>
                <h2>Revisá tu correo</h2>
                <p className="muted">
                  Te enviamos un enlace de confirmación a <strong>${sentTo}</strong>. Confirmalo y volvé para ingresar.
                </p>
                <button className="btn primary block" type="button" onClick=${() => (setSentTo(null), switchMode('login'))}>
                  Ir a ingresar
                </button>
              </div>`
          : html`
              <form className="auth-card reveal" onSubmit=${submit} noValidate>
                <div className="brand brand-mobile"><${Logo} size=${34} /><span>Finanzas Korion</span></div>

                <div className="seg" role="tablist">
                  <button type="button" role="tab" aria-selected=${!signup} className=${!signup ? 'on' : ''} onClick=${() => switchMode('login')}>Ingresar</button>
                  <button type="button" role="tab" aria-selected=${signup} className=${signup ? 'on' : ''} onClick=${() => switchMode('signup')}>Crear cuenta</button>
                </div>

                <div>
                  <h2>${signup ? 'Creá tu cuenta' : 'Bienvenido de nuevo'}</h2>
                  <p className="muted">${signup ? 'Empezá a registrar tus finanzas en un minuto.' : 'Ingresá para ver tus finanzas.'}</p>
                </div>

                <label className="field">
                  <span>Email</span>
                  <input type="email" value=${email} onChange=${(e) => setEmail(e.target.value)} autoComplete="email" placeholder="vos@ejemplo.com" autoFocus />
                </label>

                <label className="field">
                  <span>Contraseña</span>
                  <div className="input-wrap">
                    <input type=${show ? 'text' : 'password'} value=${password} onChange=${(e) => setPassword(e.target.value)}
                           autoComplete=${signup ? 'new-password' : 'current-password'} placeholder="Mínimo 6 caracteres" />
                    <button type="button" className="eye" onClick=${() => setShow(!show)} aria-label=${show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                      <${Icon} name=${show ? 'eyeOff' : 'eye'} size=${18} />
                    </button>
                  </div>
                </label>

                ${signup &&
                html`
                  <label className="field">
                    <span>Repetir contraseña</span>
                    <input type=${show ? 'text' : 'password'} value=${confirm} onChange=${(e) => setConfirm(e.target.value)} autoComplete="new-password" />
                  </label>`}

                ${error && html`<p className="error" role="alert">${error}</p>`}

                <button className="btn primary block lg" type="submit" disabled=${busy}>
                  ${busy ? 'Un momento…' : signup ? 'Crear cuenta' : 'Ingresar'}
                </button>
              </form>`}
      </main>
    </div>`;
}
