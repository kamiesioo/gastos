import { html } from '../deps.js';

const PATHS = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  chevron: 'M6 9l6 6 6-6',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M17.9 17.9A10.9 10.9 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.1-5.9M9.9 4.2A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.2 3.2M1 1l22 22',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowDown: 'M12 5v14M19 12l-7 7-7-7',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18M6 6l12 12',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4',
  piggy: 'M19 10h1a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-1.2A7 7 0 0 1 14 18v2h-3v-2H9a7 7 0 0 1-3-1l-2 1 .5-3A6.5 6.5 0 0 1 4 9a7 7 0 0 1 7-5h2a4 4 0 0 1 4 3l2 3z',
  chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
  card: 'M3 6h18v12H3zM3 10h18',
};

export const Icon = ({ name, size = 18 }) => html`
  <svg viewBox="0 0 24 24" width=${size} height=${size} fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d=${PATHS[name]} />
  </svg>`;

export const Logo = ({ size = 34 }) => html`
  <svg viewBox="0 0 40 40" width=${size} height=${size} aria-hidden="true">
    <defs>
      <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#34d399" />
        <stop offset="1" stopColor="#2563eb" />
      </linearGradient>
    </defs>
    <rect width="40" height="40" rx="11" fill="url(#logo-g)" />
    <path d="M10 25l6-6 5 4 9-10" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>`;
