/**
 * Is there a model on this machine, and which one?
 *
 * The card asks once per page, the same way it asks for the rule-class names:
 * the answer is a fact about the server process, it does not change while the
 * page is open, and a second read would only make the button slower to appear.
 *
 * A server that does not answer, or an answer without the `localModel` field
 * (an older build), reads as "not configured" — the door stays shut rather than
 * offering a click that fails.
 */
import { useEffect, useState } from "react";

export interface LocalModel {
  configured: boolean;
  /** Exactly what the operator named in `EPHEMORA_LLM_MODEL` — possibly empty. */
  model: string;
}

const OFF: LocalModel = { configured: false, model: "" };

let announced: Promise<LocalModel> | null = null;

/**
 * Read once per page, because the answer is a fact about the server process.
 *
 * A read that FAILED (no server yet, a dropped socket) is not a fact about
 * anything, so it is not cached: the next card asks again. Caching it would
 * decide for the whole session that no door exists, over a backend that was
 * still starting when the page loaded. A server that answered "not configured"
 * IS a fact, and stays cached.
 */
export function readLocalModel(): Promise<LocalModel> {
  announced ??= fetch("/api/health", { headers: { Accept: "application/json" } })
    .then((res) => (res.ok ? (res.json() as Promise<{ localModel?: Partial<LocalModel> }>) : null))
    .then((body) => {
      if (body === null) throw new Error("health did not answer");
      const llm = body.localModel;
      return llm?.configured === true
        ? { configured: true, model: typeof llm.model === "string" ? llm.model : "" }
        : OFF;
    })
    .catch(() => {
      announced = null;
      return OFF;
    });
  return announced;
}

export function useLocalModel(): LocalModel {
  const [model, setModel] = useState<LocalModel>(OFF);
  useEffect(() => {
    let live = true;
    void readLocalModel().then((m) => {
      if (live) setModel(m);
    });
    return () => {
      live = false;
    };
  }, []);
  return model;
}

/** Only for tests: each case gets its own answer. */
export function __resetLocalModelForTest(): void {
  announced = null;
}
