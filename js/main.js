import { html, createRoot } from './deps.js';
import { App } from './App.js';

createRoot(document.getElementById('root')).render(html`<${App} />`);
