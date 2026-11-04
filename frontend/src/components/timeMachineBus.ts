export const OPEN_TIME_MACHINE_EVENT = "ephemora-skyline:open-time-machine";

/** The city menu asks; the panel answers. */
export function openTimeMachine(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_TIME_MACHINE_EVENT));
}
