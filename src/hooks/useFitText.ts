import {useLayoutEffect, useRef} from 'react';

/**
 * Sizes a single line of text (the element must be `inline-block` and
 * `whitespace-nowrap`) so it spans its parent's content box exactly —
 * the headline runs edge to edge at every width without guessing at vw
 * values for a font whose advance widths we don't control.
 */
export function useFitText<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;

    const PROBE = 100;
    const fit = () => {
      el.style.fontSize = `${PROBE}px`;
      const styles = getComputedStyle(parent);
      const available =
        parent.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
      // offsetWidth is the layout box — unaffected by any transform
      // applied to the element (scrollWidth is not).
      const natural = el.offsetWidth;
      if (natural > 0) el.style.fontSize = `${(PROBE * available) / natural}px`;
    };

    fit();
    // Re-fit once the web font swaps in; its metrics differ from the fallback.
    document.fonts?.ready.then(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  return ref;
}
