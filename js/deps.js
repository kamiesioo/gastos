// Única puerta de entrada a las librerías externas (versiones fijadas acá).
// React se carga como módulo ES desde esm.sh: no hace falta Node ni paso de build.
// Las plantillas usan htm (JSX sin compilador):  html`<${Componente} prop=${valor}>texto<//>`
import React from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client?deps=react@18.3.1';
import htm from 'https://esm.sh/htm@3.1.1';

export const SUPABASE_ESM = 'https://esm.sh/@supabase/supabase-js@2';

export const html = htm.bind(React.createElement);
export const { useState, useEffect, useMemo, useRef, useCallback } = React;
export { createRoot };
