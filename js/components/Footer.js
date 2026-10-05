import { html } from '../deps.js';

export const Footer = () => html`
  <footer className="site-footer">
    <span>Desarrollado por <strong>Korion Systems</strong></span>
    <span aria-hidden="true">·</span>
    <span>© ${new Date().getFullYear()} Todos los derechos reservados</span>
  </footer>`;
