export const PATH_LONG_PRESS_MS = 500;
export const PATH_LONG_PRESS_TOLERANCE = 10;

/** One touch sequence only. Pointer cancellation/scroll always wins over the timer. */
export function installPathLongPress(
  document: Document,
  resolve: (target: EventTarget | null) => HTMLElement | null,
  open: (source: HTMLElement, x: number, y: number) => void,
): () => void {
  const window = document.defaultView!;
  let pending: { id: number; source: HTMLElement; path: string | undefined; x: number; y: number } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let consumed: { source: HTMLElement; id: number; until: number; x: number; y: number } | null = null;
  const pointers = new Set<number>();
  const cancel = () => {
    clearTimeout(timer);
    pending = null;
  };
  const down = (event: PointerEvent) => {
    // A new gesture must never inherit click suppression from the previous one.
    consumed = null;
    pointers.add(event.pointerId);
    cancel();
    if (pointers.size !== 1 || event.pointerType !== "touch" || !event.isPrimary) return;
    const source = resolve(event.target);
    if (!source) return;
    pending = { id: event.pointerId, source, path: source.dataset.copyPath, x: event.clientX, y: event.clientY };
    timer = setTimeout(() => {
      const p = pending;
      pending = null;
      if (!p || !p.source.isConnected || p.source.dataset.copyPath !== p.path) return;
      consumed = { source: p.source, id: p.id, until: Infinity, x: p.x, y: p.y };
      open(p.source, p.x, p.y);
    }, PATH_LONG_PRESS_MS);
  };
  const move = (event: PointerEvent) => {
    if (pending && event.pointerId === pending.id
      && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > PATH_LONG_PRESS_TOLERANCE) cancel();
  };
  const end = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    cancel();
    if (consumed?.id === event.pointerId) consumed.until = Date.now() + 800;
  };
  const click = (event: MouseEvent) => {
    if (!consumed || Date.now() > consumed.until || event.detail === 0) return;
    if (Math.hypot(event.clientX - consumed.x, event.clientY - consumed.y) > PATH_LONG_PRESS_TOLERANCE) return;
    // Compatibility clicks can target the newly opened menu under the finger.
    event.preventDefault();
    event.stopImmediatePropagation();
    consumed = null;
  };
  const context = (event: MouseEvent) => {
    const source = resolve(event.target);
    if (!source || (pending?.source !== source && (consumed?.source !== source || Date.now() > consumed.until))) return;
    // Touch uses our timer, not the browser's platform-dependent long-press timer.
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const reset = () => { cancel(); pointers.clear(); };
  document.addEventListener("pointerdown", down, true);
  document.addEventListener("pointermove", move, true);
  document.addEventListener("pointerup", end, true);
  document.addEventListener("pointercancel", end, true);
  document.addEventListener("click", click, true);
  document.addEventListener("contextmenu", context, true);
  window.addEventListener("scroll", cancel, true);
  window.addEventListener("blur", reset);
  window.addEventListener("resize", reset);
  document.addEventListener("visibilitychange", reset);
  return () => {
    reset();
    document.removeEventListener("pointerdown", down, true);
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("pointerup", end, true);
    document.removeEventListener("pointercancel", end, true);
    document.removeEventListener("click", click, true);
    document.removeEventListener("contextmenu", context, true);
    window.removeEventListener("scroll", cancel, true);
    window.removeEventListener("blur", reset);
    window.removeEventListener("resize", reset);
    document.removeEventListener("visibilitychange", reset);
  };
}