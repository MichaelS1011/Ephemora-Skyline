/** Minimal DOM test helper — the project does not ship @testing-library/react. */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

export function mount(node: ReactElement): HTMLDivElement {
  unmount();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

export function unmount(): void {
  if (root) act(() => root!.unmount());
  root = null;
  host?.remove();
  host = null;
}

export function q<T extends Element = HTMLElement>(selector: string): T | null {
  return (host?.querySelector(selector) ?? null) as T | null;
}

export function qa<T extends Element = HTMLElement>(selector: string): T[] {
  return [...(host?.querySelectorAll(selector) ?? [])] as T[];
}

export function byTestId(id: string): HTMLElement {
  const element = q<HTMLElement>(`[data-testid="${id}"]`);
  if (!element) throw new Error(`Missing data-testid=${id}`);
  return element;
}

export function click(element: Element | null): void {
  if (!element) throw new Error("click: element missing");
  act(() => (element as HTMLElement).click());
}

export function key(code: string): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true }));
  });
}

export function fill(element: HTMLInputElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export function text(element: Element | null): string {
  return element?.textContent ?? "";
}
