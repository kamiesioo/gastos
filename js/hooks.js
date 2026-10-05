import { useState, useEffect, useRef } from './deps.js';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Anima un número desde su valor anterior hasta `target` (easing cúbico). */
export function useCountUp(target, ms = 700) {
  const [value, setValue] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (reducedMotion()) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      from.current = origin + (target - origin) * eased;
      setValue(from.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);

  return value;
}

/** Devuelve false en el primer render y true un frame después: sirve para disparar transiciones CSS de entrada. */
export function useDrawn(resetKey) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    setDrawn(false);
    let r2;
    const r1 = requestAnimationFrame(() => (r2 = requestAnimationFrame(() => setDrawn(true))));
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [resetKey]);
  return drawn;
}
