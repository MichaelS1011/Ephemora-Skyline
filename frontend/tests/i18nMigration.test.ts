import { describe, it, expect } from "vitest";
import { t } from "../src/i18n";

/**
 * Migration guard for the legacy-component i18n pass: the EN values of keys
 * that render strings pinned by existing DOM tests (tests/workspaceControls
 * and tests/search) must stay byte-identical, and the pluralization keys must
 * reproduce the exact pre-i18n wording.
 */
describe("i18n migration — test-pinned EN strings stay byte-identical", () => {
  it("keeps the findings-panel strings the workspace tests pin", () => {
    expect(t("en", "findings.closeAria")).toBe("Close findings list");
    expect(t("en", "findings.emptyPriority", { priority: "P1" })).toBe(
      "No P1 findings in this scan.",
    );
    expect(t("en", "findings.emptyAll")).toBe("No findings in this scan.");
    expect(t("en", "findings.showAllPriorities")).toBe("Show all priorities");
    expect(t("en", "findings.showAllRules")).toBe("Show all rules");
  });

  it("keeps the search-bar strings the search tests pin", () => {
    expect(t("en", "search.statusIdle")).toBe("Search by file name, folder path or language.");
    expect(t("en", "search.statusNoMatch", { query: "zzz" })).toBe(
      "No files match “zzz”. Try a shorter name or a language like TypeScript.",
    );
    expect(t("en", "search.statusResultOne", { count: 1 })).toBe(
      "1 matching file. Use arrow keys to choose and Enter to open.",
    );
    expect(t("en", "search.statusResultMany", { count: 5 })).toBe(
      "5 matching files. Use arrow keys to choose and Enter to open.",
    );
    // The "First 8" cap rides the plural variant's {count} var.
    expect(t("en", "search.statusResultMany", { count: "First 8" })).toBe(
      "First 8 matching files. Use arrow keys to choose and Enter to open.",
    );
  });

  it("reproduces the pre-i18n singular/plural wordings of the info panel", () => {
    expect(t("en", "panel.findingsCountOne", { count: 1 })).toBe("1 Finding");
    expect(t("en", "panel.findingsCountMany", { count: 2 })).toBe("2 Findings");
    expect(t("en", "panel.testCountOne", { count: 1 })).toBe("1 test");
    expect(t("en", "panel.testCountMany", { count: 3 })).toBe("3 tests");
    expect(t("en", "panel.whyItMatters")).toBe("WHY IT MATTERS ▸ ");
    expect(t("en", "panel.openDistrict", { path: "src/api" })).toBe("→ OPEN DISTRICT /src/api");
  });
});
