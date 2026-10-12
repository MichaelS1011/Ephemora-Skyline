import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

/**
 * Punkt 34 — Zahlenknoten unter der erklärten Untergrenze, im Renderpfad
 * gemessen (nicht per deklariertem Wert).
 *
 * Die Existing-Guard `typeFloor.test.ts` liest deklarierte Größen: `text-[Npx]`,
 * `font-size: Npx`, numerisches `fontSize:`. Was sie nicht sieht, ist die
 * Größe, die der Browser selbst bildet. Ein `<small>` erbt keine Größe, sondern
 * wird von der User-Agent-Stylesheet auf `0,8 em` gesetzt — über einer 12-px-
 * Fläche sind das 9,6 px im gerenderten Bild, und keine Regel im Baum sagt
 * diesen Wert. Genau dieser Knoten ist in der Browser-Inventur der einzigen
 * Zahlenknoten außerhalb der Welt-Platten unter der Untergrenze gerutscht.
 *
 * Messpfad (lokale Sonde in eigenem Headless-Browser, nicht ausgeliefert,
 * Demo-Stadt über das sichtbare Control, 1600 × 1000, reduced motion):
 * Vor der Tat: 119 Zahlenknoten über vier Zustände, 43 unter 11 px, 40 davon an
 * der Welt-Skala, einer an diesem `<small>` (9,60 px deklariert wie gerendert,
 * weil keine Skala dazwischensteht).
 */
const SRC = path.resolve(import.meta.dirname, "../src");
const DESIGN = path.join(SRC, "design");

/** Der Satz Elemente, die der Browser ohne jede Regel verkleinert. */
const UA_SHRUNK = ["small", "sub", "sup"];

type Rule = { selector: string; body: string; line: number; file: string };

/** Regeln inkl. der in `@media` verschachtelten, mit Zeilennummer.
 *  `@keyframes` und ihre Haltepunkte sind keine Flächenregeln und fallen raus. */
function rules(cssFile: string): Rule[] {
  const text = readFileSync(cssFile, "utf-8").replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
  const rel = path.relative(SRC, cssFile).split(path.sep).join("/");
  const out: Rule[] = [];
  const stack: (Rule | "rahmen" | "haltepunkt" | null)[] = [];
  let bodyStart = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      const prelude = text.slice(bodyStart, i).trim();
      const parent = stack[stack.length - 1];
      let entry: Rule | "rahmen" | "haltepunkt" | null;
      if (prelude.startsWith("@keyframes")) entry = "rahmen";
      else if (prelude.startsWith("@")) entry = "rahmen";
      else if (parent === "rahmen") entry = "haltepunkt";
      else {
        entry = { selector: prelude, body: "", line: 0, file: rel };
        out.push(entry);
      }
      stack.push(entry);
      bodyStart = i + 1;
      continue;
    }
    if (ch === "}") {
      const rule = stack.pop();
      if (rule && typeof rule === "object") {
        rule.body = text.slice(bodyStart, i);
        rule.line = text.slice(0, bodyStart).split("\n").length;
      }
      bodyStart = i + 1;
    }
  }
  return out;
}

function designFiles(): string[] {
  return readdirSync(DESIGN)
    .filter((f) => f.endsWith(".css"))
    .map((f) => path.join(DESIGN, f));
}

describe("die Untergrenze der Zahlenknoten im tatsächlichen Renderpfad", () => {
  it("lässt kein Element, das der Browser von sich aus verkleinert, ohne gesagte Größe", () => {
    const offenders: string[] = [];
    for (const f of designFiles()) {
      for (const r of rules(f)) {
        const hitsUaShrunk = r.selector
          .split(",")
          .some((part) =>
            UA_SHRUNK.some((tag) =>
              new RegExp(`(^|[\\s>+~])${tag}($|[\\s.,>+~:\\[])`).test(` ${part} `),
            ),
          );
        if (!hitsUaShrunk) continue;
        if (!/font-size\s*:/.test(r.body)) {
          offenders.push(`${r.file}:${r.line} — ${r.selector.trim()} (User-Agent: 0,8 em)`);
        }
      }
    }
    expect(offenders, `unter der Untergrenze ohne gesagte Größe:\n${offenders.join("\n")}`).toEqual(
      [],
    );
  });

  it("hält die erklärte Untergrenze selbst konstant — kein pauschales Anheben, kein Absenken", () => {
    const globals = readFileSync(path.join(SRC, "design/globals.css"), "utf-8");
    const meta = globals.match(/--fs-meta:\s*([\d.]+)px/)?.[1];
    expect(meta, "design/globals.css erklärt --fs-meta in px").toBeDefined();
    expect(Number(meta), "die Grenze ist verschoben statt die Fläche gehoben worden").toBe(11);
  });

  it("schrumpft im HUD nur Formzeichen, nie eine Zahl", () => {
    // Zwei Regeln in stadt-ui.css setzen `transform: scale(0.78)` auf 11 px —
    // das sind die einzigen Text-Skalen, die kein Welt-Objekt sind. Sie sind
    // nur dann kein Verstoß, wenn ihr Träger nachweislich keine Ziffer zeigt.
    const scaled: string[] = [];
    for (const f of designFiles()) {
      for (const r of rules(f)) {
        const m = r.body.match(/transform:\s*scale\(\s*([0-9.]+)\s*\)/);
        if (m && Number(m[1]) < 1) scaled.push(r.selector.trim());
      }
    }
    expect(scaled.length, "erwartet werden die beiden Formzeichen-Träger").toBeGreaterThan(0);
    for (const s of scaled) {
      expect(
        s,
        "eine weitere Textfläche skaliert — die Inventur müsste neu gefahren werden",
      ).toMatch(/severity-(chip-)?shape/);
    }
    // und die Glyphen selbst: keine Ziffer in den Formzeichen-Tafeln
    for (const file of ["components/ContextCard.tsx", "components/InfoPanel.tsx"]) {
      const text = readFileSync(path.join(SRC, file), "utf-8");
      const shapes = [...text.matchAll(/P[012]:\s*"([^"]+)"/g)].map((m) => m[1]!);
      expect(shapes.length, `${file} hat keine Formzeichen-Tafel`).toBeGreaterThan(0);
      for (const s of shapes)
        expect(s, `${file} setzt eine Ziffer auf einen skalierten Träger`).not.toMatch(/\d/);
    }
  });

  it("hebt die Welt-Platten nicht durch aufgeblasene Deklaration", () => {
    // Die Platten hängen an `Html distanceFactor` (District.tsx:276,
    // RoadSystem.tsx:547, CityTree.tsx:293). Ihre deklarierten 11 px sind eine
    // Weltgröße: in der eingeflogenen Übersicht steht der Wrapper bei
    // 0,204–0,313 und rendert damit 2,15–3,44 px; im Nahbereich bei 1,0.
    // Wer die Deklaration anhebt, repariert die Übersicht nicht, er bläst den
    // Nahbereich auf — deshalb bleibt sie hier auf Tokenhöhe.
    const css = readFileSync(path.join(SRC, "design/city-funktion.css"), "utf-8");
    const sizes = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
    expect(sizes.length, "die Plattenflächen erklären ihre Größe in px").toBeGreaterThan(0);
    for (const s of sizes) {
      expect(s, "Plattendeklaration über 12 px wäre ein vorgetäuschter Boden").toBeLessThanOrEqual(
        12,
      );
    }
  });
});
