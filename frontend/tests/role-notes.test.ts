// @vitest-environment node
/**
 * MASTER-2027 Zielbild #24 (Z-07) — the three roles, in one sentence each.
 *
 * The panel's whole claim is that it does not invent citizens, so the tests
 * check the sentences against the code:
 *
 *   1. every row names a function in `city/epheRoles.ts`, and that function is
 *      really exported — a sentence whose job was deleted fails here, not in
 *      front of a reader;
 *   2. the three roles, the three glyphs and the three names are the crowd's
 *      own, not a fourth thing;
 *   3. each sentence says what the job answers AND what it refuses, because the
 *      refusals are the part that keeps a claim honest;
 *   4. it stands behind the same disclosure as the colour key, so nothing is
 *      added to the arriving screen;
 *   5. no new colour, no new loop.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { DICT } from "../src/i18n/dict";
import { ROLE_GLYPH } from "../src/city/epheRoles";
import { ROLE_NOTES, type RoleNote } from "../src/city/epheRoleNotes";

const ROLLES = readFileSync(new URL("../src/city/epheRoles.ts", import.meta.url), "utf-8");
const CARD = readFileSync(new URL("../src/components/ContextCard.tsx", import.meta.url), "utf-8");
const PANEL = readFileSync(new URL("../src/components/RoleNotes.tsx", import.meta.url), "utf-8");
const CSS = readFileSync(new URL("../src/design/stadt-ui.css", import.meta.url), "utf-8");

const satz = (n: RoleNote): string => `${DICT[n.noteKey].en} ${DICT[n.noteKey].de}`;

describe("every sentence is bound to the code that decides the job", () => {
  it("names three exported functions of the role module", () => {
    expect(ROLE_NOTES).toHaveLength(3);
    for (const n of ROLE_NOTES) {
      expect(ROLLES, `${n.quelle} is exported from epheRoles.ts`).toContain(
        `export function ${n.quelle}(`,
      );
    }
  });

  it("covers exactly the three roles the crowd knows", () => {
    expect(ROLE_NOTES.map((n) => n.role).sort()).toEqual(["explorer", "maintenance", "security"]);
    expect(Object.keys(ROLE_GLYPH).sort()).toEqual(ROLE_NOTES.map((n) => n.role).sort());
  });

  it("uses the same name the resident card already uses", () => {
    const karte = readFileSync(
      new URL("../src/components/ResidentCard.tsx", import.meta.url),
      "utf-8",
    );
    for (const n of ROLE_NOTES) {
      expect(karte, "the card names the role the panel names").toContain(`"${n.nameKey}"`);
      expect(DICT[n.nameKey]).toBeDefined();
    }
  });

  it("keeps the refusal in the sentence, not only in the code", () => {
    // The maintenance job's honest half is where it does not speak; the guide's
    // is that an unnamed edge does not answer. A panel that printed only the
    // positive case would oversell the resident.
    const wartung = ROLE_NOTES.find((n) => n.role === "maintenance")!;
    expect(satz(wartung)).toMatch(/stays home|bleibt/i);
    expect(ROLLES).toContain('file.role === "data"');

    const fuhrer = ROLE_NOTES.find((n) => n.role === "explorer")!;
    expect(satz(fuhrer)).toMatch(/only a named edge|nur eine benannte Kante/i);
    expect(ROLLES).toContain("if (selectedId === targetId) return null");
  });

  it("says which surface the job is drawn on", () => {
    for (const n of ROLE_NOTES) {
      expect(DICT[n.flaecheKey], `${n.role} needs a where`).toBeDefined();
      expect(DICT[n.flaecheKey]!.en.trim().length).toBeGreaterThan(8);
    }
    // The explorer's surface is the stripe §07.06 actually drew.
    const streifen = readFileSync(new URL("../src/city/routeLine.ts", import.meta.url), "utf-8");
    expect(streifen).toContain("stripeGeometry");
  });
});

describe("the panel is a disclosure, not a new arrival surface", () => {
  it("stands under the colour key, next to the layer view", () => {
    const auf = CARD.indexOf("{legendOpen && (");
    const block = CARD.slice(auf, CARD.indexOf(")}", auf));
    expect(block).toContain("<RoleNotes />");
    expect(block).toContain("<LayerView />");
  });

  it("is off the DOM until the reader opens it", () => {
    expect(CARD).toMatch(/\{legendOpen && \([\s\S]*?<RoleNotes \/>/);
  });

  it("carries no verb of its own", () => {
    // The card keeps one verb; a list that also asked to be clicked would be a
    // second door on the same surface.
    expect(PANEL).not.toMatch(/<button/);
    expect(PANEL).not.toMatch(/onClick/);
  });
});

describe("it adds no colour and no motion", () => {
  const block = CSS.slice(CSS.indexOf(".ctx-roles {"), CSS.indexOf("/* Severity chips"));

  it("wears the header's inks", () => {
    expect(block).toContain("var(--brand-ink)");
    expect(block).toContain("var(--meta)");
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("runs no animation", () => {
    expect(block).not.toMatch(/animation|transition|@keyframes/);
    expect(PANEL.match(/useFrame|requestAnimationFrame/g) ?? []).toHaveLength(0);
  });

  it("shows the badge as a shape, and three different ones", () => {
    const formen = Object.values(ROLE_GLYPH);
    expect(new Set(formen).size).toBe(3);
    expect(PANEL).toContain('aria-hidden="true"');
  });
});
