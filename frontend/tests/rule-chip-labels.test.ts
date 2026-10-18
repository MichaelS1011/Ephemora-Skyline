/**
 * A filter chip is read by a person.
 *
 * The findings panel printed the engine id — `regex:EVAL_USAGE`,
 * `LOCALSTORAGE_USAGE` — and cut it in the middle of a word at 310 px. The scan
 * already ships a curated class name per finding (`finding-knowledge.ts`,
 * EN and DE), so the chip reads that. This file holds the two ways that can go
 * wrong in silence:
 *
 * 1. a curated class without a name — then the chip falls back to a de-slugged
 *    id, which is at least readable, but the gap should be visible here;
 * 2. a name so long that a chip would cut it — the panel has 310 px and the
 *    chip shares them with a count badge.
 *
 * The names are read from the backend module itself, not from a copy: a table
 * that drifts from the scanner is the exact bug this replaces.
 */
import { describe, expect, it } from "vitest";
import { FINDING_KNOWLEDGE } from "../../backend/src/services/security/finding-knowledge";
import { ruleClassLabel } from "../src/city/facts";

const classes = Object.entries(FINDING_KNOWLEDGE);

describe("the names a filter chip reads", () => {
  it("names every curated rule class in both languages", () => {
    const unnamed = classes.filter(([, k]) => !k.class || !k.classDe).map(([id]) => id);
    expect(unnamed, "a curated class without a chip name").toEqual([]);
  });

  it("keeps every name short enough for the chip", () => {
    // measured: the label sits beside a count badge in a 310 px panel; 34
    // characters is the longest name that still fits beside "8" without an
    // ellipsis at 11 px (the longest real name today is 31 characters)
    const tooLong = classes
      .flatMap(([id, k]) => [k.class, k.classDe].map((n) => ({ id, n })))
      .filter(({ n }) => (n ?? "").length > 34);
    expect(tooLong).toEqual([]);
  });

  it("takes the name from the finding, in the UI language", () => {
    const named = [
      {
        ruleId: "regex:EVAL_USAGE",
        type: "EVAL_USAGE",
        label: "Eval / dynamic code",
        labelDe: "Eval / dynamischer Code",
      },
    ];
    expect(ruleClassLabel(named, "regex:EVAL_USAGE", "en")).toBe("Eval / dynamic code");
    expect(ruleClassLabel(named, "regex:EVAL_USAGE", "de")).toBe("Eval / dynamischer Code");
  });

  it("matches the chip key against ruleId and type — the ruff shape", () => {
    // The chip is keyed `ruleId ?? type`, so a ruff finding is `ruff:E711` in
    // the row and `QUALITY_E711` in the knowledge base. A first version looked
    // only at ruleId and would have named both E711 and E712 by hand.
    const ruff = [
      {
        ruleId: "ruff:E711",
        type: "QUALITY_E711",
        label: "Comparison to None",
        labelDe: "Vergleich mit None",
      },
      {
        ruleId: "ruff:E712",
        type: "QUALITY_E712",
        label: "Comparison to True/False",
        labelDe: "Vergleich mit True/False",
      },
    ];
    expect(ruleClassLabel(ruff, "ruff:E711", "en")).toBe("Comparison to None");
    expect(ruleClassLabel(ruff, "ruff:E712", "en")).toBe("Comparison to True/False");
    // same finding, keyed by its type
    expect(ruleClassLabel(ruff, "QUALITY_E712", "de")).toBe("Vergleich mit True/False");
  });

  it("names a rule from the curated table when the scan carried no label", () => {
    // Measured: the demo engine writes no `label` into its payload, so every
    // chip fell back to the id even though the table knows the class. The
    // table is passed in, so this is the exact shape the demo produces.
    const classes = {
      EVAL_USAGE: { class: "Eval on a string", classDe: "Eval auf einer Zeichenkette" },
    };
    const carried = [{ ruleId: "regex:EVAL_USAGE", type: "EVAL_USAGE" }];
    expect(ruleClassLabel(carried, "regex:EVAL_USAGE", "en", classes)).toBe("Eval on a string");
    expect(ruleClassLabel(carried, "regex:EVAL_USAGE", "de", classes)).toBe(
      "Eval auf einer Zeichenkette",
    );
    // and without the table it stays an id — a failed fetch never blanks a chip
    expect(ruleClassLabel(carried, "regex:EVAL_USAGE", "en")).toBe("EVAL_USAGE");
  });

  it("falls back to the id itself, so the chip stays searchable", () => {
    // a rule newer than this build: no curated name anywhere in the city.
    // A de-slugged "eval usage" matched nothing in the rule files; the bare id
    // does, and the tooltip carries the engine prefix.
    expect(ruleClassLabel([], "regex:UNKNOWN_NEW_RULE", "en")).toBe("UNKNOWN_NEW_RULE");
    expect(ruleClassLabel([], "LOCALSTORAGE_USAGE", "de")).toBe("LOCALSTORAGE_USAGE");
    expect(ruleClassLabel([], "regex:UNKNOWN_NEW_RULE", "en")).not.toContain(":");
  });
});
