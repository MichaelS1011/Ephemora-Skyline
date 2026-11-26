import { describe, expect, it } from "vitest";
import { FORGE_CATALOG, catalogById, HOTBAR_IDS } from "../src/forge/catalog";
import { RENDERER_FAMILIES, PORT_KINDS } from "../src/forge/contracts";

const BASELINE_CATALOG_SIZE = 122;
const MIN_NEW_BLOCKS = 40;
const VERIFIED_ON = "2026-11-24";
const NATIVE_IDS = [
  "forge-navigation",
  "forge-button",
  "forge-text",
  "forge-gallery",
  "forge-cart",
  "forge-order-form",
  "forge-user",
  "forge-storage",
  "forge-api",
  "forge-chart",
] as const;

const PINNED_VERSION = /^(?:v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?|[0-9a-f]{40})$/;

describe("FORGE catalog", () => {
  it("is substantially larger than the rejected ten-block list", () => {
    expect(FORGE_CATALOG.length).toBeGreaterThanOrEqual(BASELINE_CATALOG_SIZE + MIN_NEW_BLOCKS);
  });

  it("has no duplicate ids and complete provenance on every entry", () => {
    const ids = new Set(FORGE_CATALOG.map((entry) => entry.id));
    expect(ids.size).toBe(FORGE_CATALOG.length);
    for (const entry of FORGE_CATALOG) {
      expect(entry.id.length).toBeGreaterThan(2);
      expect(entry.version.length).toBeGreaterThan(0);
      expect(entry.license.length).toBeGreaterThan(2);
      expect(entry.source.startsWith("https://")).toBe(true);
      expect(entry.ports.length).toBeGreaterThan(0);
      expect(entry.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(entry.name.en.length + entry.name.de.length).toBeGreaterThan(3);
      for (const port of entry.ports) {
        expect(PORT_KINDS).toContain(port.kind);
        expect(["in", "out"]).toContain(port.direction);
      }
    }
  });

  it("covers every renderer family with a real executable adapter", () => {
    const renderers = new Set(FORGE_CATALOG.map((entry) => entry.renderer));
    for (const family of RENDERER_FAMILIES) expect(renderers.has(family)).toBe(true);
  });

  it("names the upstream license and marks adapted entries honestly", () => {
    const shadcn = FORGE_CATALOG.filter((entry) => entry.id.startsWith("shadcn-"));
    expect(shadcn.length).toBeGreaterThan(40);
    expect(shadcn.every((entry) => entry.license.includes("MIT"))).toBe(true);
    expect(shadcn.every((entry) => entry.implementation === "adapter")).toBe(true);
    expect(catalogById("forge-cart")?.implementation).toBe("native");
  });

  it("keeps the ten original native blocks unchanged and first", () => {
    expect(FORGE_CATALOG.slice(0, 10).map((entry) => entry.id)).toEqual(NATIVE_IDS);
    expect(
      FORGE_CATALOG.filter((entry) => entry.implementation === "native").map((entry) => entry.id),
    ).toEqual(NATIVE_IDS);
    for (const entry of FORGE_CATALOG.slice(0, 10)) {
      expect(entry.version).toBe("0.4.13");
      expect(entry.license).toBe("Apache-2.0");
      expect(entry.source).toBe("https://github.com/MichaelS1011/Ephemora-Skyline");
      expect(entry.description.en).toContain("Ephemora native");
      expect(entry.description.de).toContain("Ephemora-native");
    }
  });

  it("adds at least forty distinct, pinned and honestly adapted public components", () => {
    const additions = FORGE_CATALOG.slice(BASELINE_CATALOG_SIZE);
    expect(additions.length).toBeGreaterThanOrEqual(MIN_NEW_BLOCKS);
    expect(new Set(additions.map((entry) => entry.source)).size).toBe(additions.length);

    for (const entry of additions) {
      expect(entry.implementation).toBe("adapter");
      expect(entry.version).toMatch(PINNED_VERSION);
      expect(entry.source).toMatch(
        /^https:\/\/github\.com\/[^/]+\/[^/]+\/(?:tree|blob)\/(?:v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?|[0-9a-f]{40})\//,
      );
      expect(entry.license).toMatch(
        /^(?:MIT|ISC|Apache-2\.0) \([^)]*LICENSE(?:\.md)?, geprüft 2026-11-24\)/,
      );
      expect(entry.license).toContain("Ephemora adapter Apache-2.0");
      expect(entry.description.en).toContain("Ephemora adapter");
      expect(entry.description.en).toContain("local state");
      expect(entry.description.en).toContain("no runtime download");
      expect(entry.description.de).toContain("Ephemora-adapter");
      expect(entry.description.de).toContain("lokaler Zustand");
      expect(entry.description.de).toContain("kein Download zur Laufzeit");
      expect(entry.name.en.trim().length).toBeGreaterThan(1);
      expect(entry.name.de.trim().length).toBeGreaterThan(1);
      expect(RENDERER_FAMILIES).toContain(entry.renderer);
    }
  });

  it("pins representative new sources to their verified versions and licenses", () => {
    const samples = [
      {
        id: "shadcn-form",
        version: "055aa6b7837b1808456a24beb4c97a677864aa82",
        source:
          "https://github.com/shadcn-ui/ui/blob/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/new-york-v4/ui/form.tsx",
        license: "MIT",
        licenseFile: "LICENSE.md",
      },
      {
        id: "base-number-field",
        version: "df283577954738d028f43629af7d50e96200dd82",
        source:
          "https://github.com/mui/base-ui/blob/df283577954738d028f43629af7d50e96200dd82/packages/react/src/number-field/root/NumberFieldRoot.tsx",
        license: "MIT",
        licenseFile: "LICENSE",
      },
      {
        id: "aria-date-range-picker",
        version: "1.22.1",
        source:
          "https://github.com/adobe/react-spectrum/blob/740c6c5c4a717ca8c82fc4d15d199f6166cd42dc/packages/react-aria-components/src/DatePicker.tsx",
        license: "Apache-2.0",
        licenseFile: "LICENSE",
      },
      {
        id: "recharts-area-chart",
        version: "3.11.1",
        source: "https://github.com/recharts/recharts/blob/v3.11.1/src/chart/AreaChart.tsx",
        license: "MIT",
        licenseFile: "LICENSE",
      },
      {
        id: "rhf-controller",
        version: "7.92.0",
        source:
          "https://github.com/react-hook-form/react-hook-form/blob/6864846a29076d83d9d15c0925d0e71d9046d020/src/controller.tsx",
        license: "MIT",
        licenseFile: "LICENSE",
      },
      {
        id: "lucide-activity",
        version: "1.79.0",
        source: "https://github.com/lucide-icons/lucide/blob/1.79.0/icons/activity.svg",
        license: "ISC",
        licenseFile: "LICENSE",
      },
      {
        id: "mui-data-grid",
        version: "9.18.0",
        source:
          "https://github.com/mui/mui-x/blob/v9.18.0/packages/x-data-grid/src/DataGrid/DataGrid.tsx",
        license: "MIT",
        licenseFile: "packages/x-data-grid/LICENSE",
      },
      {
        id: "mui-bottom-navigation",
        version: "9.6.0",
        source:
          "https://github.com/mui/material-ui/blob/v9.6.0/packages/mui-material/src/BottomNavigation/BottomNavigation.js",
        license: "MIT",
        licenseFile: "LICENSE",
      },
    ] as const;

    for (const sample of samples) {
      const entry = catalogById(sample.id);
      expect(entry, sample.id).toBeDefined();
      expect(entry?.version).toBe(sample.version);
      expect(entry?.source).toBe(sample.source);
      expect(entry?.license).toContain(
        `${sample.license} (${sample.licenseFile}, geprüft ${VERIFIED_ON})`,
      );
    }
  });

  it("keeps the ten hotbar ids resolvable", () => {
    expect(HOTBAR_IDS.length).toBe(10);
    for (const id of HOTBAR_IDS) expect(catalogById(id)).toBeDefined();
  });

  it("uses plain German names for essential state blocks", () => {
    expect(catalogById("forge-user")?.name.de).toBe("Benutzer");
    expect(catalogById("forge-storage")?.name.de).toBe("Datenspeicher");
  });
});
