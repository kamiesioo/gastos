import { html, useState, useEffect } from './deps.js';
import { createStore, isDemo } from './store.js';
import { AuthScreen } from './components/AuthScreen.js';
import { Dashboard } from './components/Dashboard.js';

export function App() {
  const [store, setStore] = useState(null);
  const [user, setUser] = useState(null);
  const [bootError, setBootError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const s = await createStore();
        setUser(await s.getUser());
        setStore(s);
      } catch (err) {
        setBootError(`No se pudo conectar: ${err.message}`);
      }
    })();
  }, []);

  const logout = async () => {
    await store.signOut();
    setUser(null);
  };

  let screen;
  if (bootError) screen = html`<div className="splash"><p className="error" role="alert">${bootError}</p></div>`;
  else if (!store) screen = html`<div className="splash"><span className="spinner" aria-label="Cargando"></span></div>`;
  else if (!user) screen = html`<${AuthScreen} store=${store} onAuth=${setUser} />`;
  else screen = html`<${Dashboard} key=${user.id} store=${store} user=${user} onLogout=${logout} />`;

  return html`
    <div className="root">
      ${isDemo && html`<div className="demo-banner">Modo demo: los datos se guardan sólo en este navegador. Configurá Supabase en <code>js/config.js</code>.</div>`}
      ${screen}
    </div>`;
}
