import { catalogById } from "./catalog";
import type { ForgeCell, ForgeEdge, ForgeGraph, ForgeNode, ForgeProject } from "./contracts";
import { templateNodeContent, type ForgeLang } from "./i18n";

export type ForgeTemplate = {
  readonly id: string;
  readonly kind: ForgeProject["kind"];
  readonly name: { en: string; de: string };
  readonly eyebrow: { en: string; de: string };
  readonly description: { en: string; de: string };
  readonly result: { en: string; de: string };
  readonly accent: string;
};

export const FORGE_TEMPLATES: readonly ForgeTemplate[] = [
  {
    id: "website-onepager",
    kind: "website",
    name: { en: "Studio website", de: "Studio-Website" },
    eyebrow: { en: "WEBSITE", de: "WEBSITE" },
    description: {
      en: "Navigation, welcome text, services and a working call-to-action.",
      de: "Navigation, Begrüßung, Leistungen und ein funktionierender Call-to-Action.",
    },
    result: { en: "A responsive one-page website", de: "Eine responsive One-Page-Website" },
    accent: "#9ECE6A",
  },
  {
    id: "shop-demo",
    kind: "shop",
    name: { en: "Demo shop", de: "Demo-Shop" },
    eyebrow: { en: "WEB APP", de: "WEB-APP" },
    description: {
      en: "Products, cart, checkout and orders are already connected.",
      de: "Produkte, Warenkorb, Checkout und Bestellungen sind bereits verbunden.",
    },
    result: {
      en: "A clickable shop with a local cart",
      de: "Ein klickbarer Shop mit lokalem Warenkorb",
    },
    accent: "#E0AF68",
  },
  {
    id: "app-dashboard",
    kind: "app",
    name: { en: "Operations dashboard", de: "Operations-Dashboard" },
    eyebrow: { en: "APP", de: "APP" },
    description: {
      en: "Navigation, metrics, a data table and a working input.",
      de: "Navigation, Kennzahlen, Datentabelle und ein funktionierendes Eingabefeld.",
    },
    result: { en: "A small internal web app", de: "Eine kleine interne Web-App" },
    accent: "#7AA2F7",
  },
];

function block(id: string, catalogId: string, cell: ForgeCell, lang: ForgeLang): ForgeNode {
  const entry = catalogById(catalogId);
  if (!entry) throw new Error(`Unknown template block ${catalogId}`);
  const label = templateNodeContent({ id, catalogId, cell, label: "", color: entry.color }, lang);
  return { id, catalogId, cell, label: label ?? entry.name[lang], color: entry.color };
}

function edge(from: string, fromPort: string, to: string, toPort: string): ForgeEdge {
  return { from, fromPort, to, toPort };
}

export function templateProject(templateId: string, lang: ForgeLang = "en"): ForgeProject {
  const template = FORGE_TEMPLATES.find((candidate) => candidate.id === templateId);
  if (!template) {
    return {
      kind: "blank",
      name: lang === "de" ? "Unbenanntes Projekt" : "Untitled project",
      templateId: "blank",
    };
  }
  return { kind: template.kind, name: template.name[lang], templateId: template.id };
}

export function templateGraph(templateId: string, lang: ForgeLang = "en"): ForgeGraph {
  if (templateId === "website-onepager") {
    return {
      nodes: [
        block("site-nav", "forge-navigation", [0, 0, 0], lang),
        block("site-hero", "forge-text", [0, 0, 1], lang),
        block("site-services", "forge-text", [0, 0, 2], lang),
        block("site-work", "forge-gallery", [0, 0, 3], lang),
        block("site-cta", "forge-button", [0, 0, 4], lang),
      ],
      edges: [],
    };
  }
  if (templateId === "shop-demo") {
    return {
      nodes: [
        block("shop-nav", "forge-navigation", [0, 0, 0], lang),
        block("shop-products", "forge-gallery", [0, 0, 1], lang),
        block("shop-cart", "forge-cart", [4, 0, 1], lang),
        block("shop-user", "forge-user", [8, 0, 1], lang),
        block("shop-checkout", "forge-order-form", [4, 0, 2], lang),
        block("shop-orders", "forge-storage", [8, 0, 2], lang),
        block("shop-chart", "forge-chart", [12, 0, 2], lang),
      ],
      edges: [
        edge("shop-products", "products", "shop-cart", "products"),
        edge("shop-cart", "order", "shop-checkout", "order"),
        edge("shop-user", "user", "shop-checkout", "user"),
      ],
    };
  }
  if (templateId === "app-dashboard") {
    return {
      nodes: [
        block("app-nav", "forge-navigation", [0, 0, 0], lang),
        block("app-metrics", "forge-chart", [0, 0, 1], lang),
        block("app-input", "shadcn-input", [0, 0, 2], lang),
        block("app-table", "shadcn-table", [4, 0, 1], lang),
        block("app-action", "forge-button", [4, 0, 2], lang),
      ],
      edges: [],
    };
  }
  return { nodes: [], edges: [] };
}
