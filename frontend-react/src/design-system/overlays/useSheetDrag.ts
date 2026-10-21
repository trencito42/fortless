import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * Drag-to-dismiss for bottom sheets. Only `transform` is written (compositor-only, no layout), once per animation frame, so the sheet
 * follows the finger at the display's refresh rate. Release past 25% of the height, or a quick downward flick, closes it; otherwise it springs back.
 * Attach `handleProps` to the grab handle and header. Taps on buttons inside them never start a drag. Respects reduced motion for the spring-back.
 */
export function useSheetDrag(close: () => void) {
  const popup = useRef<HTMLElement | null>(null);
  const st = useRef({ y0: 0, dy: 0, t0: 0, id: -1, raf: 0, active: false });
  const apply = () => { st.current.raf = 0; const el = popup.current; if (el) el.style.transform = `translate3d(0, ${st.current.dy}px, 0)`; };
  const reset = useCallback((animate: boolean) => {
    const el = popup.current; if (!el) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.style.transition = animate && !reduce ? 'transform 220ms cubic-bezier(.2,.8,.2,1)' : '';
    el.style.transform = '';
    if (animate) window.setTimeout(() => { if (popup.current) popup.current.style.transition = ''; }, 260);
  }, []);
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' || (e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
    const s = st.current; s.y0 = e.clientY; s.dy = 0; s.t0 = performance.now(); s.id = e.pointerId; s.active = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (popup.current) { popup.current.style.transition = 'none'; popup.current.style.willChange = 'transform'; }
  }, []);
  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const s = st.current; if (!s.active || e.pointerId !== s.id) return;
    const raw = e.clientY - s.y0;
    s.dy = raw > 0 ? raw : raw / 8; // slight rubber band upwards
    if (!s.raf) s.raf = requestAnimationFrame(apply);
  }, []);
  const end = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const s = st.current; if (!s.active || e.pointerId !== s.id) return;
    s.active = false; if (s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; }
    const h = popup.current?.offsetHeight ?? 400; const v = s.dy / Math.max(1, performance.now() - s.t0);
    if (e.type !== 'pointercancel' && (s.dy > h * 0.25 || (v > 0.6 && s.dy > 24))) { reset(false); close(); } else reset(true);
    if (popup.current) popup.current.style.willChange = '';
  }, [close, reset]);
  const handleProps = { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end, style: { touchAction: 'none' as const } };
  return { popup, handleProps };
}
