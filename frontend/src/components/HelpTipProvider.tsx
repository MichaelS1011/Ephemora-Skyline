"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * HelpTip — global hover explanations for every UI control.
 *
 * Components keep writing plain `title="…"` attributes; this provider
 * converts them to `data-tip` lazily on first hover (removing the slow,
 * ugly native browser tooltip) and shows a styled glass popup next to the
 * element instead. No component needs to import anything — hovering any
 * element that has a title/data-tip anywhere in the app is enough.
 *
 * Disabled buttons don't fire mouse events in Chrome, so interactive
 * components should use aria-disabled instead of disabled where the
 * explanation matters (e.g. the HEAT channel switch).
 */

interface TipState {
  text: string;
  x: number;
  y: number;
  above: boolean;
}

export function HelpTipProvider() {
  const [tip, setTip] = useState<TipState | null>(null);
  const frame = useRef(0);
  const activeRef = useRef(false);

  useEffect(() => {
    const promote = (el: HTMLElement): string | null => {
      // title → data-tip once, so the native tooltip never appears
      if (!el.hasAttribute("data-tip") && el.hasAttribute("title")) {
        const text = el.getAttribute("title") ?? "";
        el.setAttribute("data-tip", text);
        el.removeAttribute("title");
        // Removing title would strip the accessible name of icon-only
        // controls (WCAG 4.1.2) — preserve it as aria-label when no
        // visible text provides one.
        if (
          !el.hasAttribute("aria-label") &&
          !el.hasAttribute("aria-labelledby") &&
          el.textContent.trim() === "" &&
          (/^(BUTTON|A|INPUT|SUMMARY)$/.test(el.tagName) || el.hasAttribute("role"))
        ) {
          el.setAttribute("aria-label", text);
        }
      }
      const text = el.getAttribute("data-tip");
      return text && text.trim() ? text : null;
    };

    const onOver = (e: Event): void => {
      const target = e.target as HTMLElement | null;
      if (!target || !(target instanceof Element)) return;
      const el = target.closest<HTMLElement>("[data-tip],[title]");
      if (!el || el === document.body) {
        setTip(null);
        return;
      }
      const text = promote(el);
      if (!text) {
        setTip(null);
        return;
      }
      showFor(el, text);
    };

    const showFor = (el: HTMLElement, text: string): void => {
      const r = el.getBoundingClientRect();
      const above = r.top > 90; // prefer above; fall back below near the top bar
      activeRef.current = true;
      setTip({ text, x: r.left + r.width / 2, y: above ? r.top - 8 : r.bottom + 8, above });
    };

    const hide = (): void => {
      activeRef.current = false;
      setTip(null);
    };

    const onMove = (e: MouseEvent): void => {
      // Reposition while hovering the same element (scroll/layout shifts).
      // Ref instead of state: the effect mounts once, a `tip` closure would be stale.
      if (!activeRef.current) return;
      const target = e.target as HTMLElement | null;
      if (!target || !(target instanceof Element)) return;
      const el = target.closest<HTMLElement>("[data-tip]");
      if (el) showFor(el, el.getAttribute("data-tip") ?? "");
    };

    const onOut = (e: Event): void => {
      const to = (e as MouseEvent).relatedTarget as HTMLElement | null;
      if (!to || !(to instanceof Element) || !to.closest("[data-tip],[title]")) {
        hide();
      }
    };

    // WCAG 1.4.13: tips for focusable controls must also appear on keyboard focus
    const onFocusIn = (e: FocusEvent): void => {
      const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-tip],[title]");
      if (!el || el === document.body) return;
      const text = promote(el);
      if (text) showFor(el, text);
    };
    const onFocusOut = (): void => hide();

    const onScrollOrResize = (): void => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => setTip(null));
    };

    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseout", onOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseout", onOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      cancelAnimationFrame(frame.current);
    };
    // The provider is a singleton: attach once, manage everything via DOM
  }, []);

  if (typeof document === "undefined" || !tip) return null;

  return createPortal(
    <div
      role="tooltip"
      className="fixed z-[80] pointer-events-none animate-fade-up font-jetbrains"
      style={{
        left: tip.x,
        top: tip.y,
        transform: `translate(-50%, ${tip.above ? "-100%" : "0"})`,
        maxWidth: 280,
        background: "rgba(18, 18, 16, 0.96)",
        border: "1px solid rgba(232,178,60,0.4)",
        borderRadius: 4,
        padding: "0.4rem 0.6rem",
        color: "#e8e4da",
        fontSize: "10px",
        lineHeight: 1.45,
        whiteSpace: "pre-wrap",
        boxShadow: "0 4px 18px rgba(0,0,0,0.5), 0 0 12px rgba(232,178,60,0.1)",
        backdropFilter: "blur(8px)",
      }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
