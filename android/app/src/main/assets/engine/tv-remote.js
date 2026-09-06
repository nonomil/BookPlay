/* Remote-first directional focus for Android TV and keyboard testing. */
(() => {
  const TV_QUERY = "(min-width: 1000px) and (orientation: landscape)";
  const FOCUSABLE = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex=\"-1\"])",
    "[role=\"button\"]",
  ].join(",");

  const isTv = () => Boolean(window.matchMedia && window.matchMedia(TV_QUERY).matches);
  const isVisible = (element) => {
    if (!element || element.getAttribute("aria-hidden") === "true") return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const isTextEntry = (element) => /^(INPUT|TEXTAREA|SELECT)$/.test(element?.tagName || "");

  function focusables() {
    return [...document.querySelectorAll(FOCUSABLE)].filter(isVisible);
  }

  function focusInitial() {
    if (!isTv() || document.activeElement !== document.body) return;
    const first = focusables()[0];
    if (first) first.focus();
  }

  function moveFocus(direction, current) {
    const source = current.getBoundingClientRect();
    const sourceX = source.left + source.width / 2;
    const sourceY = source.top + source.height / 2;
    const candidates = focusables()
      .filter((element) => element !== current)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const dx = x - sourceX;
        const dy = y - sourceY;
        const primary = direction === "left" || direction === "right" ? dx : dy;
        const cross = direction === "left" || direction === "right" ? dy : dx;
        const forward = direction === "right" || direction === "down" ? primary > 8 : primary < -8;
        if (!forward) return null;
        return { element, score: Math.abs(primary) * 1000 + Math.abs(cross) };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score);
    const next = candidates[0]?.element;
    if (!next) return false;
    next.focus();
    return true;
  }

  document.addEventListener("keydown", (event) => {
    if (!isTv() || !/^Arrow(?:Up|Down|Left|Right)$/.test(event.key)) return;
    const current = document.activeElement;
    if (current === document.body) {
      focusInitial();
      if (document.activeElement !== document.body) event.preventDefault();
      return;
    }
    if (!current || isTextEntry(current) || !isVisible(current)) return;
    const direction = event.key.slice(5).toLowerCase();
    if (moveFocus(direction, current)) event.preventDefault();
  }, { capture: true });

  // Pages such as wala/map reveal their first controls after async data loads.
  // Re-check only while body owns focus, so user focus is never stolen.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", focusInitial, { once: true });
  } else {
    setTimeout(focusInitial, 0);
  }
  if (window.MutationObserver) {
    const observer = new MutationObserver(focusInitial);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "style"],
    });
  }
})();
