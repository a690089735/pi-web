"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/hooks/useI18n";
import { copyText } from "@/lib/clipboard";
import { getPathMenuActions, type PathMenuActions } from "@/lib/path-menu-actions";
import { installPathLongPress } from "@/lib/path-menu-gesture";

interface MenuTarget {
  path: string;
  x: number;
  y: number;
  source: HTMLElement;
  previousFocus: HTMLElement | null;
  actions?: PathMenuActions;
  touch: boolean;
}

const itemStyle: CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 32, boxSizing: "border-box",
  padding: "4px 12px", border: 0, borderRadius: 4, textAlign: "left",
  background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 13,
  textDecoration: "none",
};

const iconStyle: CSSProperties = {
  width: 14, height: 14, flexShrink: 0, display: "inline-flex",
  alignItems: "center", justifyContent: "center", lineHeight: 1,
};

/** Opt-in only: native menus, session extensions and terminal menus stay untouched. */
export function PathContextMenu() {
  const { t } = useI18n();
  const [target, setTarget] = useState<MenuTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const copyingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    const resolve = (target: EventTarget | null) => {
      if (!(target instanceof Element) || target.closest("input, textarea, [contenteditable]:not([contenteditable=false])")) return null;
      const source = target.closest<HTMLElement>("[data-copy-path]");
      return source?.dataset.copyPath ? source : null;
    };
    const show = (source: HTMLElement, x: number, y: number, touch: boolean) => {
      const rect = source.getBoundingClientRect();
      setNotice(null);
      setTarget({
        path: source.dataset.copyPath!, x: x || rect.left, y: y || rect.bottom, source,
        actions: getPathMenuActions(source), touch,
        previousFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      });
    };
    const removeLongPress = installPathLongPress(document, resolve, (source, x, y) => show(source, x, y, true));
    const open = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof Element)) return;
      setTarget(null);
      const source = resolve(event.target);
      if (!source) return;
      event.preventDefault();
      show(source, event.clientX, event.clientY, false);
    };
    const keyOpen = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))) return;
      const source = resolve(event.target);
      if (!source) return;
      event.preventDefault();
      show(source, 0, 0, false);
    };
    document.addEventListener("contextmenu", open);
    document.addEventListener("keydown", keyOpen);
    return () => {
      mountedRef.current = false;
      document.removeEventListener("contextmenu", open);
      document.removeEventListener("keydown", keyOpen);
      removeLongPress();
    };
  }, []);

  useLayoutEffect(() => {
    if (!target || !menuRef.current) return;
    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(target.x, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(target.y, window.innerHeight - rect.height - 8))}px`;
    menu.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const dismiss = () => setTarget(null);
    const scroll = (event: Event) => {
      if (!(event.target instanceof Node) || !menuRef.current?.contains(event.target)) dismiss();
    };
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) dismiss();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Capture before the global Escape-to-abort listener, regardless of focus.
        event.preventDefault();
        event.stopImmediatePropagation();
        dismiss();
        if (!target.touch && target.previousFocus?.isConnected) target.previousFocus.focus({ preventScroll: true });
      } else if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      } else if (event.key === "Tab") {
        dismiss();
      }
    };
    const observer = new MutationObserver(() => {
      if (!target.source.isConnected || target.source.dataset.copyPath !== target.path
        || getPathMenuActions(target.source)?.cwd !== target.actions?.cwd) dismiss();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-copy-path"] });
    document.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", keyboard, true);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [target]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  const copy = async () => {
    if (!target || copyingRef.current) return;
    copyingRef.current = true;
    try {
      // Invoke synchronously from the gesture; no server request or path rewriting.
      await copyText(target.path);
      if (mountedRef.current) setNotice(t("pathMenu.copied"));
    } catch {
      if (mountedRef.current) setNotice(t("pathMenu.copyFailed"));
    } finally {
      copyingRef.current = false;
    }
  };

  const close = () => {
    setTarget(null);
    if (target && !target.touch && target.previousFocus?.isConnected) target.previousFocus.focus({ preventScroll: true });
  };

  if (!target && !notice) return null;
  return createPortal(
    <>
      {target && (
        <div ref={menuRef} role="menu" aria-label={t("pathMenu.actions")} style={{
          position: "fixed", left: target.x, top: target.y, zIndex: 2000,
          padding: 4, minWidth: 140, maxHeight: "calc(100dvh - 16px)", overflowY: "auto", maxWidth: "calc(100vw - 16px)", background: "var(--bg-panel)",
          border: "1px solid var(--border)", borderRadius: 6, boxShadow: "0 6px 24px rgba(0,0,0,0.2)",
        }} onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}>
          {target.actions && <button type="button" role="menuitem" className="path-menu-item"
            disabled={!target.actions.mention} style={itemStyle} onClick={() => {
              const current = getPathMenuActions(target.source);
              setTarget(null);
              if (target.source.isConnected && current?.cwd === target.actions?.cwd) current?.mention?.();
            }}><span aria-hidden="true" style={iconStyle}>@</span><span>{t("files.mention")}</span></button>}
          <button type="button" role="menuitem" className="path-menu-item" onClick={() => {
            void copy();
            close();
          }} style={itemStyle}>
            <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>{t("pathMenu.copy")}</span>
          </button>
          {target.actions?.downloadUrl && <a role="menuitem" className="path-menu-item" style={itemStyle}
            href={target.actions.downloadUrl} download onClick={close}>
            <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>{t("files.download")}</span>
          </a>}
        </div>
      )}
      {notice && <div role="status" style={{
        position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 2001,
        maxWidth: "calc(100vw - 32px)", padding: "8px 16px", borderRadius: 6,
        background: "var(--bg-panel)", border: "1px solid var(--border)", color: "var(--text)",
        fontSize: 13, pointerEvents: "none",
      }}>{notice}</div>}
    </>,
    document.body,
  );
}