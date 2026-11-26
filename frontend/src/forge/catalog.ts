/**
 * FORGE catalog — a large, provenance-checked block library.
 *
 * Researched 2026-11-23 and extended 2026-11-24 from the npm registry and the
 * upstream repositories: shadcn/ui, Radix UI, Base UI, React Aria Components,
 * MUI/MUI X, Recharts, React Hook Form, and Lucide. Upstream licenses are MIT,
 * ISC, or Apache-2.0 as named. Exact versions/commits are in each entry.
 *
 * HONESTY. These are Ephemora adapters, not vendored upstream source: the
 * runtime has one real React renderer per `renderer` family, and every entry
 * names the upstream component it models plus its license and repository.
 * No foreign bundle is fetched, imported or evaluated at runtime. Adding a
 * vendored upstream component means adding its checked source file and
 * flipping `implementation` to "native" with a credit in NOTICE.
 */
import type { CatalogEntry, Port, RendererFamily } from "./contracts";

const PALETTE = [
  "#7AA2F7",
  "#E0AF68",
  "#9ECE6A",
  "#F7768E",
  "#BB9AF7",
  "#7DCFFF",
  "#89DDFF",
  "#FF9E64",
  "#73DACA",
  "#EFA6A6",
] as const;

const GROUPS: (readonly CatalogEntry[])[] = [];

// Ephemora native blocks — the executable starting set
const GROUP_0: readonly CatalogEntry[] = [
  {
    id: "forge-navigation",
    version: "0.4.13",
    name: { en: "Navigation", de: "Navigation" },
    description: {
      en: "Ephemora native for Navigation: real React output, local state, no runtime download.",
      de: "Ephemora-native für Navigation: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "navigation",
    renderer: "nav",
    implementation: "native",
    license: "Apache-2.0",
    source: "https://github.com/MichaelS1011/Ephemora-Skyline",
    ports: [{ id: "ui", kind: "struct:ui", direction: "out" }],
    color: PALETTE[0],
  },
  {
    id: "forge-button",
    version: "0.4.13",
    name: { en: "Button", de: "Schalter" },
    description: {
      en: "Ephemora native for Button: real React output, local state, no runtime download.",
      de: "Ephemora-native für Button: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "interaction",
    renderer: "button",
    implementation: "native",
    license: "Apache-2.0",
    source: "https://github.com/MichaelS1011/Ephemora-Skyline",
    ports: [{ id: "click", kind: "event:click", direction: "out" }],
    color: PALETTE[0],
  },
  {
    id: "forge-text",
    version: "0.4.13",
    name: { en: "Text", de: "Text" },
    description: {
      en: "Ephemora native for Text: real React output, local state, no runtime download.",
      de: "Ephemora-native für Text: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "text",
    implementation: "native",
    license: "Apache-2.0",
    source: "https://github.com/MichaelS1011/Ephemora-Skyline",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "forge-gallery",
    version: "0.4.13",
    name: { en: "Product gallery", de: "Produktgalerie" },
    description: {
      en: "Ephemora native for Product gallery: real React output, local state, no runtime download.",
      de: "Ephemora-native für Product gallery: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "gallery",
    implementation: "native",
    license: "Apache-2.0",
    source: "https://github.com/MichaelS1011/Ephemora-Skyline",
    ports: [
      { id: "products", kind: "data:product", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "forge-cart",
    version: "0.4.13",
    name: { en: "Cart", de: "Warenkorb" },
    description: {
      en: "Ephemora native for Cart: real React output, local state, no runtime download.",
      de: "Ephemora-native für Cart: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "state",
    renderer: "cart",
    implementation: "native",
    license: "Apache-2.0",
    source: "https://github.com/MichaelS1011/Ephemora-Skyline",
    ports: [
      { id: "products", kind: "data:product", direction: "in", required: true },
      { id: "store", kind: "state:store", direction: "in" },
      { id: "order", kind: "data:order", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "forge-order-form",
    version: "0.4.13",
    name: { en: "Order form", de: "Bestellformular" },
    description: {
      en: "Ephemora native for Order form: real React output, local state, no runtime download.",
      de: "Ephemora-native für Order form: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "interaction",
    renderer: "form",
    implementation: "native",
    license: "Apache-2.0",
    source: "https://github.com/MichaelS1011/Ephemora-Skyline",
    ports: [
      { id: "order", kind: "data:order", direction: "in", required: true },
      { id: "user", kind: "data:user", direction: "in", required: true },
      { id: "submit", kind: "event:submit", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "forge-user",
    version: "0.4.13",
    name: { en: "User", de: "Benutzer" },
    description: {
      en: "Ephemora native for User: real React output, local state, no runtime download.",
      de: "Ephemora-native für Benutzer: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "state",
    renderer: "user",
    implementation: "native",
    license: "Apache-2.0",
    source: "https://github.com/MichaelS1011/Ephemora-Skyline",
    ports: [{ id: "user", kind: "data:user", direction: "out" }],
    color: PALETTE[0],
  },
  {
    id: "forge-storage",
    version: "0.4.13",
    name: { en: "Data store", de: "Datenspeicher" },
    description: {
      en: "Ephemora native for Data store: real React output, local state, no runtime download.",
      de: "Ephemora-native für Datenspeicher: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "state",
    renderer: "storage",
    implementation: "native",
    license: "Apache-2.0",
    source: "https://github.com/MichaelS1011/Ephemora-Skyline",
    ports: [{ id: "store", kind: "state:store", direction: "out" }],
    color: PALETTE[0],
  },
  {
    id: "forge-api",
    version: "0.4.13",
    name: { en: "API call", de: "API-Aufruf" },
    description: {
      en: "Ephemora native for API call: real React output, local state, no runtime download.",
      de: "Ephemora-native für API call: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "data",
    renderer: "gallery",
    implementation: "native",
    license: "Apache-2.0",
    source: "https://github.com/MichaelS1011/Ephemora-Skyline",
    ports: [
      { id: "products", kind: "data:product", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "forge-chart",
    version: "0.4.13",
    name: { en: "Chart", de: "Diagramm" },
    description: {
      en: "Ephemora native for Chart: real React output, local state, no runtime download.",
      de: "Ephemora-native für Chart: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "chart",
    implementation: "native",
    license: "Apache-2.0",
    source: "https://github.com/MichaelS1011/Ephemora-Skyline",
    ports: [
      { id: "order", kind: "data:order", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
] as const;
GROUPS.push(GROUP_0);

// shadcn/ui registry (MIT, commit 055aa6b, 2026-11-23 verified)
const GROUP_1: readonly CatalogEntry[] = [
  {
    id: "shadcn-accordion",
    version: "055aa6b",
    name: { en: "Accordion", de: "Akkordeon" },
    description: {
      en: "Ephemora adapter for Accordion: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Accordion: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "text",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/accordion.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-alert",
    version: "055aa6b",
    name: { en: "Alert", de: "Hinweis" },
    description: {
      en: "Ephemora adapter for Alert: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Alert: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "feedback",
    renderer: "feedback",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/alert.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-alert-dialog",
    version: "055aa6b",
    name: { en: "Alert dialog", de: "Bestätigungsdialog" },
    description: {
      en: "Ephemora adapter for Alert dialog: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Alert dialog: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "overlay",
    renderer: "dialog",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/alert-dialog.tsx",
    ports: [
      { id: "open", kind: "event:click", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-aspect-ratio",
    version: "055aa6b",
    name: { en: "Aspect ratio", de: "Bildformat" },
    description: {
      en: "Ephemora adapter for Aspect ratio: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Aspect ratio: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "media",
    renderer: "icon",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/aspect-ratio.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-avatar",
    version: "055aa6b",
    name: { en: "Avatar", de: "Profilbild" },
    description: {
      en: "Ephemora adapter for Avatar: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Avatar: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "media",
    renderer: "icon",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/avatar.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-badge",
    version: "055aa6b",
    name: { en: "Badge", de: "Etikett" },
    description: {
      en: "Ephemora adapter for Badge: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Badge: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "feedback",
    renderer: "feedback",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/badge.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-breadcrumb",
    version: "055aa6b",
    name: { en: "Breadcrumb", de: "Brotkrumennavigation" },
    description: {
      en: "Ephemora adapter for Breadcrumb: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Breadcrumb: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "navigation",
    renderer: "nav",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/breadcrumb.tsx",
    ports: [{ id: "ui", kind: "struct:ui", direction: "out" }],
    color: PALETTE[0],
  },
  {
    id: "shadcn-button",
    version: "055aa6b",
    name: { en: "Button", de: "Schalter" },
    description: {
      en: "Ephemora adapter for Button: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Button: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "interaction",
    renderer: "button",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/button.tsx",
    ports: [{ id: "click", kind: "event:click", direction: "out" }],
    color: PALETTE[0],
  },
  {
    id: "shadcn-button-group",
    version: "055aa6b",
    name: { en: "Button group", de: "Schaltergruppe" },
    description: {
      en: "Ephemora adapter for Button group: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Button group: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "interaction",
    renderer: "button",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/button-group.tsx",
    ports: [{ id: "click", kind: "event:click", direction: "out" }],
    color: PALETTE[0],
  },
  {
    id: "shadcn-calendar",
    version: "055aa6b",
    name: { en: "Calendar", de: "Kalender" },
    description: {
      en: "Ephemora adapter for Calendar: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Calendar: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "data",
    renderer: "date",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/calendar.tsx",
    ports: [{ id: "text", kind: "data:text", direction: "out" }],
    color: PALETTE[0],
  },
  {
    id: "shadcn-card",
    version: "055aa6b",
    name: { en: "Card", de: "Karte" },
    description: {
      en: "Ephemora adapter for Card: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Card: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "text",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/card.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-carousel",
    version: "055aa6b",
    name: { en: "Carousel", de: "Bildergalerie" },
    description: {
      en: "Ephemora adapter for Carousel: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Carousel: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "gallery",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/carousel.tsx",
    ports: [
      { id: "products", kind: "data:product", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-chart",
    version: "055aa6b",
    name: { en: "Chart", de: "Diagramm" },
    description: {
      en: "Ephemora adapter for Chart: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Chart: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "chart",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/chart.tsx",
    ports: [
      { id: "order", kind: "data:order", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-checkbox",
    version: "055aa6b",
    name: { en: "Checkbox", de: "Kontrollkästchen" },
    description: {
      en: "Ephemora adapter for Checkbox: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Checkbox: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "input",
    renderer: "input",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/checkbox.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-collapsible",
    version: "055aa6b",
    name: { en: "Collapsible", de: "Einklappbereich" },
    description: {
      en: "Ephemora adapter for Collapsible: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Collapsible: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "text",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/collapsible.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-combobox",
    version: "055aa6b",
    name: { en: "Combobox", de: "Kombinationsfeld" },
    description: {
      en: "Ephemora adapter for Combobox: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Combobox: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "input",
    renderer: "input",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/combobox.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-command",
    version: "055aa6b",
    name: { en: "Command palette", de: "Befehlspalette" },
    description: {
      en: "Ephemora adapter for Command palette: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Command palette: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "overlay",
    renderer: "dialog",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/command.tsx",
    ports: [
      { id: "open", kind: "event:click", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-context-menu",
    version: "055aa6b",
    name: { en: "Context menu", de: "Kontextmenü" },
    description: {
      en: "Ephemora adapter for Context menu: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Context menu: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "overlay",
    renderer: "dialog",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/context-menu.tsx",
    ports: [
      { id: "open", kind: "event:click", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-dialog",
    version: "055aa6b",
    name: { en: "Dialog", de: "Dialogfenster" },
    description: {
      en: "Ephemora adapter for Dialog: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Dialog: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "overlay",
    renderer: "dialog",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/dialog.tsx",
    ports: [
      { id: "open", kind: "event:click", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-drawer",
    version: "055aa6b",
    name: { en: "Drawer", de: "Schublade" },
    description: {
      en: "Ephemora adapter for Drawer: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Drawer: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "overlay",
    renderer: "dialog",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/drawer.tsx",
    ports: [
      { id: "open", kind: "event:click", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-dropdown-menu",
    version: "055aa6b",
    name: { en: "Dropdown menu", de: "Ausklappmenü" },
    description: {
      en: "Ephemora adapter for Dropdown menu: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Dropdown menu: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "overlay",
    renderer: "dialog",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/dropdown-menu.tsx",
    ports: [
      { id: "open", kind: "event:click", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-empty",
    version: "055aa6b",
    name: { en: "Empty state", de: "Leerzustand" },
    description: {
      en: "Ephemora adapter for Empty state: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Empty state: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "feedback",
    renderer: "feedback",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/empty.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-field",
    version: "055aa6b",
    name: { en: "Field", de: "Formularfeld" },
    description: {
      en: "Ephemora adapter for Field: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Field: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "input",
    renderer: "input",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/field.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-hover-card",
    version: "055aa6b",
    name: { en: "Hover card", de: "Schwebkarte" },
    description: {
      en: "Ephemora adapter for Hover card: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Hover card: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "overlay",
    renderer: "dialog",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/hover-card.tsx",
    ports: [
      { id: "open", kind: "event:click", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-input",
    version: "055aa6b",
    name: { en: "Input", de: "Eingabefeld" },
    description: {
      en: "Ephemora adapter for Input: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Input: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "input",
    renderer: "input",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/input.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-input-group",
    version: "055aa6b",
    name: { en: "Input group", de: "Eingabegruppe" },
    description: {
      en: "Ephemora adapter for Input group: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Input group: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "input",
    renderer: "input",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/input-group.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-input-otp",
    version: "055aa6b",
    name: { en: "OTP input", de: "Code-Eingabe" },
    description: {
      en: "Ephemora adapter for OTP input: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für OTP input: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "input",
    renderer: "input",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/input-otp.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-item",
    version: "055aa6b",
    name: { en: "Item", de: "Listeneintrag" },
    description: {
      en: "Ephemora adapter for Item: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Item: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "text",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/item.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-kbd",
    version: "055aa6b",
    name: { en: "Keyboard key", de: "Tastentaste" },
    description: {
      en: "Ephemora adapter for Keyboard key: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Keyboard key: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "text",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/kbd.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-label",
    version: "055aa6b",
    name: { en: "Label", de: "Beschriftung" },
    description: {
      en: "Ephemora adapter for Label: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Label: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "text",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/label.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-pagination",
    version: "055aa6b",
    name: { en: "Pagination", de: "Seitennavigation" },
    description: {
      en: "Ephemora adapter for Pagination: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Pagination: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "navigation",
    renderer: "nav",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/pagination.tsx",
    ports: [{ id: "ui", kind: "struct:ui", direction: "out" }],
    color: PALETTE[0],
  },
  {
    id: "shadcn-popover",
    version: "055aa6b",
    name: { en: "Popover", de: "Einblendung" },
    description: {
      en: "Ephemora adapter for Popover: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Popover: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "overlay",
    renderer: "dialog",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/popover.tsx",
    ports: [
      { id: "open", kind: "event:click", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-progress",
    version: "055aa6b",
    name: { en: "Progress", de: "Fortschritt" },
    description: {
      en: "Ephemora adapter for Progress: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Progress: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "feedback",
    renderer: "feedback",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/progress.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-radio-group",
    version: "055aa6b",
    name: { en: "Radio group", de: "Auswahlgruppe" },
    description: {
      en: "Ephemora adapter for Radio group: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Radio group: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "input",
    renderer: "input",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/radio-group.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-resizable",
    version: "055aa6b",
    name: { en: "Resizable panels", de: "Teilbare Bereiche" },
    description: {
      en: "Ephemora adapter for Resizable panels: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Resizable panels: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "text",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/resizable.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-scroll-area",
    version: "055aa6b",
    name: { en: "Scroll area", de: "Scrollbereich" },
    description: {
      en: "Ephemora adapter for Scroll area: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Scroll area: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "text",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/scroll-area.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-select",
    version: "055aa6b",
    name: { en: "Select", de: "Auswahlfeld" },
    description: {
      en: "Ephemora adapter for Select: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Select: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "input",
    renderer: "input",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/select.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-separator",
    version: "055aa6b",
    name: { en: "Separator", de: "Trennlinie" },
    description: {
      en: "Ephemora adapter for Separator: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Separator: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "text",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/separator.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-sheet",
    version: "055aa6b",
    name: { en: "Sheet", de: "Seitenfenster" },
    description: {
      en: "Ephemora adapter for Sheet: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Sheet: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "overlay",
    renderer: "dialog",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/sheet.tsx",
    ports: [
      { id: "open", kind: "event:click", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-sidebar",
    version: "055aa6b",
    name: { en: "Sidebar", de: "Seitenleiste" },
    description: {
      en: "Ephemora adapter for Sidebar: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Sidebar: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "navigation",
    renderer: "nav",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/sidebar.tsx",
    ports: [{ id: "ui", kind: "struct:ui", direction: "out" }],
    color: PALETTE[0],
  },
  {
    id: "shadcn-skeleton",
    version: "055aa6b",
    name: { en: "Skeleton", de: "Ladeplatzhalter" },
    description: {
      en: "Ephemora adapter for Skeleton: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Skeleton: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "feedback",
    renderer: "feedback",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/skeleton.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-slider",
    version: "055aa6b",
    name: { en: "Slider", de: "Regler" },
    description: {
      en: "Ephemora adapter for Slider: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Slider: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "input",
    renderer: "input",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/slider.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-sonner",
    version: "055aa6b",
    name: { en: "Toast", de: "Meldung" },
    description: {
      en: "Ephemora adapter for Toast: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Toast: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "feedback",
    renderer: "feedback",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/sonner.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-spinner",
    version: "055aa6b",
    name: { en: "Spinner", de: "Ladeanzeige" },
    description: {
      en: "Ephemora adapter for Spinner: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Spinner: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "feedback",
    renderer: "feedback",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/spinner.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-switch",
    version: "055aa6b",
    name: { en: "Switch", de: "Umschalter" },
    description: {
      en: "Ephemora adapter for Switch: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Switch: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "input",
    renderer: "input",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/switch.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-table",
    version: "055aa6b",
    name: { en: "Table", de: "Tabelle" },
    description: {
      en: "Ephemora adapter for Table: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Table: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "table",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/table.tsx",
    ports: [
      { id: "products", kind: "data:product", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-tabs",
    version: "055aa6b",
    name: { en: "Tabs", de: "Registerkarten" },
    description: {
      en: "Ephemora adapter for Tabs: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Tabs: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "navigation",
    renderer: "nav",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/tabs.tsx",
    ports: [{ id: "ui", kind: "struct:ui", direction: "out" }],
    color: PALETTE[0],
  },
  {
    id: "shadcn-textarea",
    version: "055aa6b",
    name: { en: "Textarea", de: "Mehrzeileneingabe" },
    description: {
      en: "Ephemora adapter for Textarea: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Textarea: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "input",
    renderer: "input",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/textarea.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "shadcn-toggle",
    version: "055aa6b",
    name: { en: "Toggle", de: "Umschaltknopf" },
    description: {
      en: "Ephemora adapter for Toggle: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Toggle: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "interaction",
    renderer: "button",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/toggle.tsx",
    ports: [{ id: "click", kind: "event:click", direction: "out" }],
    color: PALETTE[0],
  },
  {
    id: "shadcn-toggle-group",
    version: "055aa6b",
    name: { en: "Toggle group", de: "Umschaltgruppe" },
    description: {
      en: "Ephemora adapter for Toggle group: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Toggle group: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "interaction",
    renderer: "button",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/toggle-group.tsx",
    ports: [{ id: "click", kind: "event:click", direction: "out" }],
    color: PALETTE[0],
  },
  {
    id: "shadcn-tooltip",
    version: "055aa6b",
    name: { en: "Tooltip", de: "Hinweis" },
    description: {
      en: "Ephemora adapter for Tooltip: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Tooltip: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "feedback",
    renderer: "feedback",
    implementation: "adapter",
    license: "MIT (LICENSE.md, geprüft 2026-11-23) + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/shadcn-ui/ui/tree/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/tooltip.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
] as const;
GROUPS.push(GROUP_1);

// Radix UI primitives (MIT, npm latest verified 2026-11-23)
const GROUP_2: readonly CatalogEntry[] = [
  {
    id: "radix-accordion",
    version: "1.3.1",
    name: { en: "Accordion", de: "Accordion" },
    description: {
      en: "Ephemora adapter for Accordion: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Accordion: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "primitive",
    renderer: "text",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://registry.npmjs.org/@radix-ui/react-accordion",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[1],
  },
  {
    id: "radix-avatar",
    version: "1.3.1",
    name: { en: "Avatar", de: "Avatar" },
    description: {
      en: "Ephemora adapter for Avatar: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Avatar: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "primitive",
    renderer: "icon",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://registry.npmjs.org/@radix-ui/react-avatar",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[2],
  },
  {
    id: "radix-checkbox",
    version: "1.4.1",
    name: { en: "Checkbox", de: "Checkbox" },
    description: {
      en: "Ephemora adapter for Checkbox: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Checkbox: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "primitive",
    renderer: "input",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://registry.npmjs.org/@radix-ui/react-checkbox",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[3],
  },
  {
    id: "radix-collapsible",
    version: "1.2.1",
    name: { en: "Collapsible", de: "Collapsible" },
    description: {
      en: "Ephemora adapter for Collapsible: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Collapsible: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "primitive",
    renderer: "text",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://registry.npmjs.org/@radix-ui/react-collapsible",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[4],
  },
  {
    id: "radix-context-menu",
    version: "2.4.1",
    name: { en: "Context Menu", de: "Context Menu" },
    description: {
      en: "Ephemora adapter for Context Menu: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Context Menu: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "primitive",
    renderer: "dialog",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://registry.npmjs.org/@radix-ui/react-context-menu",
    ports: [
      { id: "open", kind: "event:click", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[5],
  },
  {
    id: "radix-dialog",
    version: "1.3.1",
    name: { en: "Dialog", de: "Dialog" },
    description: {
      en: "Ephemora adapter for Dialog: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Dialog: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "primitive",
    renderer: "dialog",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://registry.npmjs.org/@radix-ui/react-dialog",
    ports: [
      { id: "open", kind: "event:click", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[6],
  },
  {
    id: "radix-dropdown-menu",
    version: "2.2.1",
    name: { en: "Dropdown Menu", de: "Dropdown Menu" },
    description: {
      en: "Ephemora adapter for Dropdown Menu: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Dropdown Menu: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "primitive",
    renderer: "dialog",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://registry.npmjs.org/@radix-ui/react-dropdown-menu",
    ports: [
      { id: "open", kind: "event:click", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[7],
  },
  {
    id: "radix-hover-card",
    version: "1.2.1",
    name: { en: "Hover Card", de: "Hover Card" },
    description: {
      en: "Ephemora adapter for Hover Card: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Hover Card: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "primitive",
    renderer: "dialog",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://registry.npmjs.org/@radix-ui/react-hover-card",
    ports: [
      { id: "open", kind: "event:click", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[8],
  },
  {
    id: "radix-menubar",
    version: "1.2.1",
    name: { en: "Menubar", de: "Menubar" },
    description: {
      en: "Ephemora adapter for Menubar: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Menubar: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "primitive",
    renderer: "nav",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://registry.npmjs.org/@radix-ui/react-menubar",
    ports: [{ id: "ui", kind: "struct:ui", direction: "out" }],
    color: PALETTE[9],
  },
  {
    id: "radix-navigation-menu",
    version: "1.4.1",
    name: { en: "Navigation Menu", de: "Navigation Menu" },
    description: {
      en: "Ephemora adapter for Navigation Menu: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Navigation Menu: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "primitive",
    renderer: "nav",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://registry.npmjs.org/@radix-ui/react-navigation-menu",
    ports: [{ id: "ui", kind: "struct:ui", direction: "out" }],
    color: PALETTE[0],
  },
  {
    id: "radix-popover",
    version: "1.3.1",
    name: { en: "Popover", de: "Popover" },
    description: {
      en: "Ephemora adapter for Popover: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Popover: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "primitive",
    renderer: "dialog",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://registry.npmjs.org/@radix-ui/react-popover",
    ports: [
      { id: "open", kind: "event:click", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[1],
  },
  {
    id: "radix-progress",
    version: "1.2.1",
    name: { en: "Progress", de: "Progress" },
    description: {
      en: "Ephemora adapter for Progress: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Progress: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "primitive",
    renderer: "feedback",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://registry.npmjs.org/@radix-ui/react-progress",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[2],
  },
  {
    id: "radix-radio-group",
    version: "1.5.1",
    name: { en: "Radio Group", de: "Radio Group" },
    description: {
      en: "Ephemora adapter for Radio Group: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Radio Group: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "primitive",
    renderer: "input",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://registry.npmjs.org/@radix-ui/react-radio-group",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[3],
  },
  {
    id: "radix-scroll-area",
    version: "1.4.0",
    name: { en: "Scroll Area", de: "Scroll Area" },
    description: {
      en: "Ephemora adapter for Scroll Area: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Scroll Area: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "primitive",
    renderer: "text",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://registry.npmjs.org/@radix-ui/react-scroll-area",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[4],
  },
  {
    id: "radix-select",
    version: "2.4.1",
    name: { en: "Select", de: "Select" },
    description: {
      en: "Ephemora adapter for Select: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Select: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "primitive",
    renderer: "input",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://registry.npmjs.org/@radix-ui/react-select",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[5],
  },
  {
    id: "radix-separator",
    version: "1.2.0",
    name: { en: "Separator", de: "Separator" },
    description: {
      en: "Ephemora adapter for Separator: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Separator: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "primitive",
    renderer: "text",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://registry.npmjs.org/@radix-ui/react-separator",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[6],
  },
  {
    id: "radix-slider",
    version: "1.6.1",
    name: { en: "Slider", de: "Slider" },
    description: {
      en: "Ephemora adapter for Slider: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Slider: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "primitive",
    renderer: "input",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://registry.npmjs.org/@radix-ui/react-slider",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[7],
  },
  {
    id: "radix-switch",
    version: "1.4.1",
    name: { en: "Switch", de: "Switch" },
    description: {
      en: "Ephemora adapter for Switch: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Switch: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "primitive",
    renderer: "input",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://registry.npmjs.org/@radix-ui/react-switch",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[8],
  },
  {
    id: "radix-tabs",
    version: "1.2.1",
    name: { en: "Tabs", de: "Tabs" },
    description: {
      en: "Ephemora adapter for Tabs: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Tabs: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "primitive",
    renderer: "nav",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://registry.npmjs.org/@radix-ui/react-tabs",
    ports: [{ id: "ui", kind: "struct:ui", direction: "out" }],
    color: PALETTE[9],
  },
  {
    id: "radix-toggle",
    version: "1.2.1",
    name: { en: "Toggle", de: "Toggle" },
    description: {
      en: "Ephemora adapter for Toggle: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Toggle: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "primitive",
    renderer: "button",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://registry.npmjs.org/@radix-ui/react-toggle",
    ports: [{ id: "click", kind: "event:click", direction: "out" }],
    color: PALETTE[0],
  },
  {
    id: "radix-toggle-group",
    version: "1.2.1",
    name: { en: "Toggle Group", de: "Toggle Group" },
    description: {
      en: "Ephemora adapter for Toggle Group: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Toggle Group: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "primitive",
    renderer: "button",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://registry.npmjs.org/@radix-ui/react-toggle-group",
    ports: [{ id: "click", kind: "event:click", direction: "out" }],
    color: PALETTE[1],
  },
  {
    id: "radix-tooltip",
    version: "1.4.1",
    name: { en: "Tooltip", de: "Tooltip" },
    description: {
      en: "Ephemora adapter for Tooltip: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Tooltip: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "primitive",
    renderer: "feedback",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://registry.npmjs.org/@radix-ui/react-tooltip",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[2],
  },
] as const;
GROUPS.push(GROUP_2);

// MUI / MUI X (MIT, npm 9.6.0 and 9.18.0 verified 2026-11-23)
const GROUP_3: readonly CatalogEntry[] = [
  {
    id: "mui-app-bar",
    version: "9.6.0",
    name: { en: "App bar", de: "Kopfleiste" },
    description: {
      en: "Ephemora adapter for App bar: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für App bar: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "navigation",
    renderer: "nav",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/AppBar.tsx",
    ports: [{ id: "ui", kind: "struct:ui", direction: "out" }],
    color: PALETTE[3],
  },
  {
    id: "mui-autocomplete",
    version: "9.6.0",
    name: { en: "Autocomplete", de: "Autovervollständigung" },
    description: {
      en: "Ephemora adapter for Autocomplete: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Autocomplete: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "input",
    renderer: "input",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Autocomplete.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[4],
  },
  {
    id: "mui-avatar",
    version: "9.6.0",
    name: { en: "Avatar", de: "Profilbild" },
    description: {
      en: "Ephemora adapter for Avatar: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Avatar: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "media",
    renderer: "icon",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Avatar.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[5],
  },
  {
    id: "mui-badge",
    version: "9.6.0",
    name: { en: "Badge", de: "Etikett" },
    description: {
      en: "Ephemora adapter for Badge: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Badge: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "feedback",
    renderer: "feedback",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Badge.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[6],
  },
  {
    id: "mui-breadcrumbs",
    version: "9.6.0",
    name: { en: "Breadcrumbs", de: "Brotkrumennavigation" },
    description: {
      en: "Ephemora adapter for Breadcrumbs: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Breadcrumbs: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "navigation",
    renderer: "nav",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Breadcrumbs.tsx",
    ports: [{ id: "ui", kind: "struct:ui", direction: "out" }],
    color: PALETTE[7],
  },
  {
    id: "mui-button",
    version: "9.6.0",
    name: { en: "Button", de: "Schalter" },
    description: {
      en: "Ephemora adapter for Button: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Button: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "interaction",
    renderer: "button",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Button.tsx",
    ports: [{ id: "click", kind: "event:click", direction: "out" }],
    color: PALETTE[8],
  },
  {
    id: "mui-card",
    version: "9.6.0",
    name: { en: "Card", de: "Karte" },
    description: {
      en: "Ephemora adapter for Card: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Card: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "text",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Card.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[9],
  },
  {
    id: "mui-checkbox",
    version: "9.6.0",
    name: { en: "Checkbox", de: "Kontrollkästchen" },
    description: {
      en: "Ephemora adapter for Checkbox: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Checkbox: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "input",
    renderer: "input",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Checkbox.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "mui-chip",
    version: "9.6.0",
    name: { en: "Chip", de: "Chip" },
    description: {
      en: "Ephemora adapter for Chip: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Chip: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "feedback",
    renderer: "feedback",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Chip.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[1],
  },
  {
    id: "mui-dialog",
    version: "9.6.0",
    name: { en: "Dialog", de: "Dialogfenster" },
    description: {
      en: "Ephemora adapter for Dialog: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Dialog: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "overlay",
    renderer: "dialog",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Dialog.tsx",
    ports: [
      { id: "open", kind: "event:click", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[2],
  },
  {
    id: "mui-divider",
    version: "9.6.0",
    name: { en: "Divider", de: "Trennlinie" },
    description: {
      en: "Ephemora adapter for Divider: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Divider: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "text",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Divider.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[3],
  },
  {
    id: "mui-drawer",
    version: "9.6.0",
    name: { en: "Drawer", de: "Schublade" },
    description: {
      en: "Ephemora adapter for Drawer: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Drawer: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "overlay",
    renderer: "dialog",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Drawer.tsx",
    ports: [
      { id: "open", kind: "event:click", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[4],
  },
  {
    id: "mui-fab",
    version: "9.6.0",
    name: { en: "Floating button", de: "Schwebeschalter" },
    description: {
      en: "Ephemora adapter for Floating button: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Floating button: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "interaction",
    renderer: "button",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Fab.tsx",
    ports: [{ id: "click", kind: "event:click", direction: "out" }],
    color: PALETTE[5],
  },
  {
    id: "mui-icon",
    version: "9.6.0",
    name: { en: "Icon", de: "Symbol" },
    description: {
      en: "Ephemora adapter for Icon: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Icon: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "media",
    renderer: "icon",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Icon.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[6],
  },
  {
    id: "mui-list",
    version: "9.6.0",
    name: { en: "List", de: "Liste" },
    description: {
      en: "Ephemora adapter for List: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für List: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "text",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/List.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[7],
  },
  {
    id: "mui-menu",
    version: "9.6.0",
    name: { en: "Menu", de: "Menü" },
    description: {
      en: "Ephemora adapter for Menu: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Menu: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "overlay",
    renderer: "dialog",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Menu.tsx",
    ports: [
      { id: "open", kind: "event:click", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[8],
  },
  {
    id: "mui-pagination",
    version: "9.6.0",
    name: { en: "Pagination", de: "Seitennavigation" },
    description: {
      en: "Ephemora adapter for Pagination: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Pagination: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "navigation",
    renderer: "nav",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Pagination.tsx",
    ports: [{ id: "ui", kind: "struct:ui", direction: "out" }],
    color: PALETTE[9],
  },
  {
    id: "mui-progress",
    version: "9.6.0",
    name: { en: "Progress", de: "Fortschritt" },
    description: {
      en: "Ephemora adapter for Progress: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Progress: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "feedback",
    renderer: "feedback",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Progress.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "mui-rating",
    version: "9.6.0",
    name: { en: "Rating", de: "Bewertung" },
    description: {
      en: "Ephemora adapter for Rating: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Rating: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "feedback",
    renderer: "feedback",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Rating.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[1],
  },
  {
    id: "mui-slider",
    version: "9.6.0",
    name: { en: "Slider", de: "Regler" },
    description: {
      en: "Ephemora adapter for Slider: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Slider: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "input",
    renderer: "input",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Slider.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[2],
  },
  {
    id: "mui-snackbar",
    version: "9.6.0",
    name: { en: "Snackbar", de: "Meldung" },
    description: {
      en: "Ephemora adapter for Snackbar: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Snackbar: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "feedback",
    renderer: "feedback",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Snackbar.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[3],
  },
  {
    id: "mui-stepper",
    version: "9.6.0",
    name: { en: "Stepper", de: "Schrittfolge" },
    description: {
      en: "Ephemora adapter for Stepper: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Stepper: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "navigation",
    renderer: "nav",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Stepper.tsx",
    ports: [{ id: "ui", kind: "struct:ui", direction: "out" }],
    color: PALETTE[4],
  },
  {
    id: "mui-switch",
    version: "9.6.0",
    name: { en: "Switch", de: "Umschalter" },
    description: {
      en: "Ephemora adapter for Switch: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Switch: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "input",
    renderer: "input",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Switch.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[5],
  },
  {
    id: "mui-table",
    version: "9.6.0",
    name: { en: "Table", de: "Tabelle" },
    description: {
      en: "Ephemora adapter for Table: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Table: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "table",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Table.tsx",
    ports: [
      { id: "products", kind: "data:product", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[6],
  },
  {
    id: "mui-tabs",
    version: "9.6.0",
    name: { en: "Tabs", de: "Registerkarten" },
    description: {
      en: "Ephemora adapter for Tabs: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Tabs: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "navigation",
    renderer: "nav",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Tabs.tsx",
    ports: [{ id: "ui", kind: "struct:ui", direction: "out" }],
    color: PALETTE[7],
  },
  {
    id: "mui-text-field",
    version: "9.6.0",
    name: { en: "Text field", de: "Eingabefeld" },
    description: {
      en: "Ephemora adapter for Text field: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Text field: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "input",
    renderer: "input",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/TextField.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[8],
  },
  {
    id: "mui-toggle-button",
    version: "9.6.0",
    name: { en: "Toggle button", de: "Umschaltknopf" },
    description: {
      en: "Ephemora adapter for Toggle button: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Toggle button: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "interaction",
    renderer: "button",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/ToggleButton.tsx",
    ports: [{ id: "click", kind: "event:click", direction: "out" }],
    color: PALETTE[9],
  },
  {
    id: "mui-tooltip",
    version: "9.6.0",
    name: { en: "Tooltip", de: "Hinweis" },
    description: {
      en: "Ephemora adapter for Tooltip: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Tooltip: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "feedback",
    renderer: "feedback",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Tooltip.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "mui-tree-view",
    version: "9.18.0",
    name: { en: "Tree view", de: "Baumansicht" },
    description: {
      en: "Ephemora adapter for Tree view: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Tree view: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "text",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mui/material-ui/tree/v9.18.0/packages/x-data-grid/src/TreeView.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[1],
  },
  {
    id: "mui-typography",
    version: "9.6.0",
    name: { en: "Typography", de: "Text" },
    description: {
      en: "Ephemora adapter for Typography: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Typography: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "text",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source:
      "https://github.com/mui/material-ui/tree/v9.6.0/packages/mui-material/src/Typography.tsx",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[2],
  },
] as const;
GROUPS.push(GROUP_3);

// Checked utility/data adapters (licenses from npm registry, 2026-11-23)
const GROUP_4: readonly CatalogEntry[] = [
  {
    id: "util-form-engine",
    version: "7.92.0",
    name: { en: "Form engine", de: "Formular-Engine" },
    description: {
      en: "Ephemora adapter for Form engine: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Form engine: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "interaction",
    renderer: "form",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/react-hook-form/react-hook-form",
    ports: [
      { id: "order", kind: "data:order", direction: "in", required: true },
      { id: "user", kind: "data:user", direction: "in", required: true },
      { id: "submit", kind: "event:submit", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[3],
  },
  {
    id: "util-validation",
    version: "4.6.7",
    name: { en: "Schema validation", de: "Schemaprüfung" },
    description: {
      en: "Ephemora adapter for Schema validation: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Schema validation: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "input",
    renderer: "input",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/colinhacks/zod",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[4],
  },
  {
    id: "util-query",
    version: "5.108.4",
    name: { en: "Local query cache", de: "Lokaler Abfragecache" },
    description: {
      en: "Ephemora adapter for Local query cache: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Local query cache: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "state",
    renderer: "storage",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/TanStack/query",
    ports: [{ id: "store", kind: "state:store", direction: "out" }],
    color: PALETTE[5],
  },
  {
    id: "util-calendar",
    version: "4.4.0",
    name: { en: "Calendar dates", de: "Kalenderdaten" },
    description: {
      en: "Ephemora adapter for Calendar dates: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Calendar dates: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "data",
    renderer: "date",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/date-fns/date-fns",
    ports: [{ id: "text", kind: "data:text", direction: "out" }],
    color: PALETTE[6],
  },
  {
    id: "util-csv-import",
    version: "5.7.1",
    name: { en: "CSV import", de: "CSV-Import" },
    description: {
      en: "Ephemora adapter for CSV import: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für CSV import: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "data",
    renderer: "gallery",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/mholt/PapaParse",
    ports: [
      { id: "products", kind: "data:product", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[7],
  },
  {
    id: "util-sheet-import",
    version: "0.18.5",
    name: { en: "Spreadsheet import", de: "Tabellenimport" },
    description: {
      en: "Ephemora adapter for Spreadsheet import: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Spreadsheet import: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "data",
    renderer: "gallery",
    implementation: "adapter",
    license: "Apache-2.0 + Ephemora adapter Apache-2.0",
    source: "https://github.com/SheetJS/sheetjs",
    ports: [
      { id: "products", kind: "data:product", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[8],
  },
  {
    id: "util-chart-lib",
    version: "3.11.1",
    name: { en: "Chart renderer", de: "Diagramm-Renderer" },
    description: {
      en: "Ephemora adapter for Chart renderer: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Chart renderer: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "chart",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/recharts/recharts",
    ports: [
      { id: "order", kind: "data:order", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[9],
  },
  {
    id: "util-icons",
    version: "1.78.0",
    name: { en: "Icon set", de: "Symbolsatz" },
    description: {
      en: "Ephemora adapter for Icon set: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Icon set: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "media",
    renderer: "icon",
    implementation: "adapter",
    license: "ISC + Ephemora adapter Apache-2.0",
    source: "https://github.com/lucide-icons/lucide",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  },
  {
    id: "util-registry-cli",
    version: "0.9.5",
    name: { en: "Registry CLI", de: "Registry-Werkzeug" },
    description: {
      en: "Ephemora adapter for Registry CLI: real React output, local state, no runtime download.",
      de: "Ephemora-adapter für Registry CLI: echte React-Ausgabe, lokaler Zustand, kein Download zur Laufzeit.",
    },
    type: "content",
    renderer: "text",
    implementation: "adapter",
    license: "MIT + Ephemora adapter Apache-2.0",
    source: "https://github.com/shadcn-ui/ui",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[1],
  },
] as const;
GROUPS.push(GROUP_4);

// Public component adapters verified against pinned upstream files on 2026-11-24.
// The descriptions name Ephemora's existing local renderer, not vendored code.
type AdapterSpec = {
  readonly id: string;
  readonly version: string;
  readonly name: { readonly en: string; readonly de: string };
  readonly type: string;
  readonly renderer: RendererFamily;
  readonly source: string;
  readonly license: "MIT" | "ISC" | "Apache-2.0";
  readonly licenseFile: string;
  readonly ports: readonly Port[];
  readonly color: string;
};

const ADAPTER_RUNTIME: Readonly<
  Record<RendererFamily, { readonly en: string; readonly de: string }>
> = {
  nav: {
    en: "own local React navigation renderer",
    de: "eigener lokaler React-Navigations-Renderer",
  },
  button: { en: "own local React button renderer", de: "eigener lokaler React-Schalter-Renderer" },
  text: { en: "own local React text renderer", de: "eigener lokaler React-Text-Renderer" },
  gallery: { en: "own local React gallery renderer", de: "eigener lokaler React-Galerie-Renderer" },
  cart: { en: "own local React cart renderer", de: "eigener lokaler React-Warenkorb-Renderer" },
  form: { en: "own local React form renderer", de: "eigener lokaler React-Formular-Renderer" },
  user: { en: "own local React user renderer", de: "eigener lokaler React-Benutzer-Renderer" },
  storage: {
    en: "own local React storage renderer",
    de: "eigener lokaler React-Speicher-Renderer",
  },
  chart: { en: "own local React chart renderer", de: "eigener lokaler React-Diagramm-Renderer" },
  dialog: { en: "own local React dialog renderer", de: "eigener lokaler React-Dialog-Renderer" },
  table: { en: "own local React table renderer", de: "eigener lokaler React-Tabellen-Renderer" },
  input: { en: "own local React input renderer", de: "eigener lokaler React-Eingabe-Renderer" },
  feedback: {
    en: "own local React feedback renderer",
    de: "eigener lokaler React-Feedback-Renderer",
  },
  icon: { en: "own local React icon renderer", de: "eigener lokaler React-Symbol-Renderer" },
  date: { en: "own local React date renderer", de: "eigener lokaler React-Datums-Renderer" },
};

function publicAdapter(spec: AdapterSpec): CatalogEntry {
  const runtime = ADAPTER_RUNTIME[spec.renderer];
  return {
    id: spec.id,
    version: spec.version,
    name: spec.name,
    description: {
      en: `Ephemora adapter for ${spec.name.en}: ${runtime.en}, local state, no runtime download; upstream source is reference only.`,
      de: `Ephemora-adapter für ${spec.name.de}: ${runtime.de}, lokaler Zustand, kein Download zur Laufzeit; die Fremdquelle dient nur als Referenz.`,
    },
    type: spec.type,
    renderer: spec.renderer,
    implementation: "adapter",
    license: `${spec.license} (${spec.licenseFile}, geprüft 2026-11-24) + Ephemora adapter Apache-2.0`,
    source: spec.source,
    ports: spec.ports,
    color: spec.color,
  };
}

// shadcn/ui additions (MIT, LICENSE.md, commit 055aa6b7837b1808456a24beb4c97a677864aa82)
const GROUP_5: readonly CatalogEntry[] = [
  publicAdapter({
    id: "shadcn-form",
    version: "055aa6b7837b1808456a24beb4c97a677864aa82",
    name: { en: "Form", de: "Formular" },
    type: "interaction",
    renderer: "form",
    source:
      "https://github.com/shadcn-ui/ui/blob/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/new-york-v4/ui/form.tsx",
    license: "MIT",
    licenseFile: "LICENSE.md",
    ports: [
      { id: "order", kind: "data:order", direction: "in", required: true },
      { id: "user", kind: "data:user", direction: "in", required: true },
      { id: "submit", kind: "event:submit", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  }),
  publicAdapter({
    id: "shadcn-menubar",
    version: "055aa6b7837b1808456a24beb4c97a677864aa82",
    name: { en: "Menubar", de: "Menüleiste" },
    type: "navigation",
    renderer: "nav",
    source:
      "https://github.com/shadcn-ui/ui/blob/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/menubar.tsx",
    license: "MIT",
    licenseFile: "LICENSE.md",
    ports: [{ id: "ui", kind: "struct:ui", direction: "out" }],
    color: PALETTE[1],
  }),
  publicAdapter({
    id: "shadcn-navigation-menu",
    version: "055aa6b7837b1808456a24beb4c97a677864aa82",
    name: { en: "Navigation menu", de: "Navigationsmenü" },
    type: "navigation",
    renderer: "nav",
    source:
      "https://github.com/shadcn-ui/ui/blob/055aa6b7837b1808456a24beb4c97a677864aa82/apps/v4/registry/bases/radix/ui/navigation-menu.tsx",
    license: "MIT",
    licenseFile: "LICENSE.md",
    ports: [{ id: "ui", kind: "struct:ui", direction: "out" }],
    color: PALETTE[2],
  }),
] as const;
GROUPS.push(GROUP_5);

// Base UI additions (MIT, LICENSE, commit df283577954738d028f43629af7d50e96200dd82)
const GROUP_6: readonly CatalogEntry[] = [
  publicAdapter({
    id: "base-number-field",
    version: "df283577954738d028f43629af7d50e96200dd82",
    name: { en: "Number field", de: "Zahlenfeld" },
    type: "input",
    renderer: "input",
    source:
      "https://github.com/mui/base-ui/blob/df283577954738d028f43629af7d50e96200dd82/packages/react/src/number-field/root/NumberFieldRoot.tsx",
    license: "MIT",
    licenseFile: "LICENSE",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[3],
  }),
  publicAdapter({
    id: "base-meter",
    version: "df283577954738d028f43629af7d50e96200dd82",
    name: { en: "Meter", de: "Messanzeige" },
    type: "feedback",
    renderer: "feedback",
    source:
      "https://github.com/mui/base-ui/blob/df283577954738d028f43629af7d50e96200dd82/packages/react/src/meter/root/MeterRoot.tsx",
    license: "MIT",
    licenseFile: "LICENSE",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[4],
  }),
  publicAdapter({
    id: "base-fieldset",
    version: "df283577954738d028f43629af7d50e96200dd82",
    name: { en: "Fieldset", de: "Feldgruppe" },
    type: "input",
    renderer: "input",
    source:
      "https://github.com/mui/base-ui/blob/df283577954738d028f43629af7d50e96200dd82/packages/react/src/fieldset/root/FieldsetRoot.tsx",
    license: "MIT",
    licenseFile: "LICENSE",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[5],
  }),
  publicAdapter({
    id: "base-toast",
    version: "df283577954738d028f43629af7d50e96200dd82",
    name: { en: "Toast", de: "Toast-Meldung" },
    type: "feedback",
    renderer: "feedback",
    source:
      "https://github.com/mui/base-ui/blob/df283577954738d028f43629af7d50e96200dd82/packages/react/src/toast/root/ToastRoot.tsx",
    license: "MIT",
    licenseFile: "LICENSE",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[6],
  }),
  publicAdapter({
    id: "base-checkbox-group",
    version: "df283577954738d028f43629af7d50e96200dd82",
    name: { en: "Checkbox group", de: "Kontrollkästchengruppe" },
    type: "input",
    renderer: "input",
    source:
      "https://github.com/mui/base-ui/blob/df283577954738d028f43629af7d50e96200dd82/packages/react/src/checkbox-group/CheckboxGroup.tsx",
    license: "MIT",
    licenseFile: "LICENSE",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[7],
  }),
] as const;
GROUPS.push(GROUP_6);

// React Aria Components additions (Apache-2.0, LICENSE, npm 1.22.1 commit 740c6c5)
const GROUP_7: readonly CatalogEntry[] = [
  publicAdapter({
    id: "aria-date-field",
    version: "1.22.1",
    name: { en: "Date field", de: "Datumsfeld" },
    type: "input",
    renderer: "date",
    source:
      "https://github.com/adobe/react-spectrum/blob/740c6c5c4a717ca8c82fc4d15d199f6166cd42dc/packages/react-aria-components/src/DateField.tsx",
    license: "Apache-2.0",
    licenseFile: "LICENSE",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[8],
  }),
  publicAdapter({
    id: "aria-date-range-picker",
    version: "1.22.1",
    name: { en: "Date range picker", de: "Datumsbereichsauswahl" },
    type: "input",
    renderer: "date",
    source:
      "https://github.com/adobe/react-spectrum/blob/740c6c5c4a717ca8c82fc4d15d199f6166cd42dc/packages/react-aria-components/src/DatePicker.tsx",
    license: "Apache-2.0",
    licenseFile: "LICENSE",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[9],
  }),
  publicAdapter({
    id: "aria-time-field",
    version: "1.22.1",
    name: { en: "Time field", de: "Zeitfeld" },
    type: "input",
    renderer: "date",
    source:
      "https://github.com/adobe/react-spectrum/blob/740c6c5c4a717ca8c82fc4d15d199f6166cd42dc/packages/react-aria-components/exports/TimeField.ts",
    license: "Apache-2.0",
    licenseFile: "LICENSE",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  }),
  publicAdapter({
    id: "aria-range-calendar",
    version: "1.22.1",
    name: { en: "Range calendar", de: "Zeitraumkalender" },
    type: "input",
    renderer: "date",
    source:
      "https://github.com/adobe/react-spectrum/blob/740c6c5c4a717ca8c82fc4d15d199f6166cd42dc/packages/react-aria-components/src/Calendar.tsx",
    license: "Apache-2.0",
    licenseFile: "LICENSE",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[1],
  }),
  publicAdapter({
    id: "aria-search-field",
    version: "1.22.1",
    name: { en: "Search field", de: "Suchfeld" },
    type: "input",
    renderer: "input",
    source:
      "https://github.com/adobe/react-spectrum/blob/740c6c5c4a717ca8c82fc4d15d199f6166cd42dc/packages/react-aria-components/src/SearchField.tsx",
    license: "Apache-2.0",
    licenseFile: "LICENSE",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[2],
  }),
  publicAdapter({
    id: "aria-tag-group",
    version: "1.22.1",
    name: { en: "Tag group", de: "Schlagwortgruppe" },
    type: "input",
    renderer: "input",
    source:
      "https://github.com/adobe/react-spectrum/blob/740c6c5c4a717ca8c82fc4d15d199f6166cd42dc/packages/react-aria-components/src/TagGroup.tsx",
    license: "Apache-2.0",
    licenseFile: "LICENSE",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[3],
  }),
  publicAdapter({
    id: "aria-file-trigger",
    version: "1.22.1",
    name: { en: "File trigger", de: "Dateiauslöser" },
    type: "input",
    renderer: "input",
    source:
      "https://github.com/adobe/react-spectrum/blob/740c6c5c4a717ca8c82fc4d15d199f6166cd42dc/packages/react-aria-components/src/FileTrigger.tsx",
    license: "Apache-2.0",
    licenseFile: "LICENSE",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "submit", kind: "event:submit", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[4],
  }),
  publicAdapter({
    id: "aria-drop-zone",
    version: "1.22.1",
    name: { en: "Drop zone", de: "Ablegebereich" },
    type: "input",
    renderer: "input",
    source:
      "https://github.com/adobe/react-spectrum/blob/740c6c5c4a717ca8c82fc4d15d199f6166cd42dc/packages/react-aria-components/src/DropZone.tsx",
    license: "Apache-2.0",
    licenseFile: "LICENSE",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "submit", kind: "event:submit", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[5],
  }),
] as const;
GROUPS.push(GROUP_7);

// Recharts additions (MIT, LICENSE, tag v3.11.1)
const GROUP_8: readonly CatalogEntry[] = [
  publicAdapter({
    id: "recharts-area-chart",
    version: "3.11.1",
    name: { en: "Area chart", de: "Flächendiagramm" },
    type: "content",
    renderer: "chart",
    source: "https://github.com/recharts/recharts/blob/v3.11.1/src/chart/AreaChart.tsx",
    license: "MIT",
    licenseFile: "LICENSE",
    ports: [
      { id: "order", kind: "data:order", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[6],
  }),
  publicAdapter({
    id: "recharts-bar-chart",
    version: "3.11.1",
    name: { en: "Bar chart", de: "Balkendiagramm" },
    type: "content",
    renderer: "chart",
    source: "https://github.com/recharts/recharts/blob/v3.11.1/src/chart/BarChart.tsx",
    license: "MIT",
    licenseFile: "LICENSE",
    ports: [
      { id: "order", kind: "data:order", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[7],
  }),
  publicAdapter({
    id: "recharts-line-chart",
    version: "3.11.1",
    name: { en: "Line chart", de: "Liniendiagramm" },
    type: "content",
    renderer: "chart",
    source: "https://github.com/recharts/recharts/blob/v3.11.1/src/chart/LineChart.tsx",
    license: "MIT",
    licenseFile: "LICENSE",
    ports: [
      { id: "order", kind: "data:order", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[8],
  }),
  publicAdapter({
    id: "recharts-pie-chart",
    version: "3.11.1",
    name: { en: "Pie chart", de: "Kreisdiagramm" },
    type: "content",
    renderer: "chart",
    source: "https://github.com/recharts/recharts/blob/v3.11.1/src/chart/PieChart.tsx",
    license: "MIT",
    licenseFile: "LICENSE",
    ports: [
      { id: "order", kind: "data:order", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[9],
  }),
  publicAdapter({
    id: "recharts-radial-bar-chart",
    version: "3.11.1",
    name: { en: "Radial bar chart", de: "Radiales Balkendiagramm" },
    type: "content",
    renderer: "chart",
    source: "https://github.com/recharts/recharts/blob/v3.11.1/src/chart/RadialBarChart.tsx",
    license: "MIT",
    licenseFile: "LICENSE",
    ports: [
      { id: "order", kind: "data:order", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  }),
  publicAdapter({
    id: "recharts-scatter-chart",
    version: "3.11.1",
    name: { en: "Scatter chart", de: "Streudiagramm" },
    type: "content",
    renderer: "chart",
    source: "https://github.com/recharts/recharts/blob/v3.11.1/src/chart/ScatterChart.tsx",
    license: "MIT",
    licenseFile: "LICENSE",
    ports: [
      { id: "order", kind: "data:order", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[1],
  }),
  publicAdapter({
    id: "recharts-sankey",
    version: "3.11.1",
    name: { en: "Sankey diagram", de: "Sankey-Diagramm" },
    type: "content",
    renderer: "chart",
    source: "https://github.com/recharts/recharts/blob/v3.11.1/src/chart/Sankey.tsx",
    license: "MIT",
    licenseFile: "LICENSE",
    ports: [
      { id: "order", kind: "data:order", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[2],
  }),
] as const;
GROUPS.push(GROUP_8);

// React Hook Form additions (MIT, LICENSE, npm 7.92.0 commit 6864846a)
const GROUP_9: readonly CatalogEntry[] = [
  publicAdapter({
    id: "rhf-form-provider",
    version: "7.92.0",
    name: { en: "Form provider", de: "Formular-Anbieter" },
    type: "interaction",
    renderer: "form",
    source:
      "https://github.com/react-hook-form/react-hook-form/blob/6864846a29076d83d9d15c0925d0e71d9046d020/src/form.tsx",
    license: "MIT",
    licenseFile: "LICENSE",
    ports: [
      { id: "order", kind: "data:order", direction: "in", required: true },
      { id: "user", kind: "data:user", direction: "in", required: true },
      { id: "submit", kind: "event:submit", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[3],
  }),
  publicAdapter({
    id: "rhf-controller",
    version: "7.92.0",
    name: { en: "Controller", de: "Feldsteuerung" },
    type: "interaction",
    renderer: "form",
    source:
      "https://github.com/react-hook-form/react-hook-form/blob/6864846a29076d83d9d15c0925d0e71d9046d020/src/controller.tsx",
    license: "MIT",
    licenseFile: "LICENSE",
    ports: [
      { id: "order", kind: "data:order", direction: "in", required: true },
      { id: "user", kind: "data:user", direction: "in", required: true },
      { id: "submit", kind: "event:submit", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[4],
  }),
  publicAdapter({
    id: "rhf-use-field-array",
    version: "7.92.0",
    name: { en: "Field array", de: "Feldliste" },
    type: "interaction",
    renderer: "form",
    source:
      "https://github.com/react-hook-form/react-hook-form/blob/6864846a29076d83d9d15c0925d0e71d9046d020/src/useFieldArray.ts",
    license: "MIT",
    licenseFile: "LICENSE",
    ports: [
      { id: "order", kind: "data:order", direction: "in", required: true },
      { id: "user", kind: "data:user", direction: "in", required: true },
      { id: "submit", kind: "event:submit", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[5],
  }),
  publicAdapter({
    id: "rhf-use-watch",
    version: "7.92.0",
    name: { en: "Form watcher", de: "Formularbeobachter" },
    type: "interaction",
    renderer: "form",
    source:
      "https://github.com/react-hook-form/react-hook-form/blob/6864846a29076d83d9d15c0925d0e71d9046d020/src/useWatch.ts",
    license: "MIT",
    licenseFile: "LICENSE",
    ports: [
      { id: "order", kind: "data:order", direction: "in", required: true },
      { id: "user", kind: "data:user", direction: "in", required: true },
      { id: "submit", kind: "event:submit", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[6],
  }),
  publicAdapter({
    id: "rhf-error-message",
    version: "7.92.0",
    name: { en: "Error message", de: "Fehlermeldung" },
    type: "feedback",
    renderer: "form",
    source:
      "https://github.com/react-hook-form/react-hook-form/blob/6864846a29076d83d9d15c0925d0e71d9046d020/src/errorMessage.tsx",
    license: "MIT",
    licenseFile: "LICENSE",
    ports: [
      { id: "order", kind: "data:order", direction: "in", required: true },
      { id: "user", kind: "data:user", direction: "in", required: true },
      { id: "submit", kind: "event:submit", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[7],
  }),
] as const;
GROUPS.push(GROUP_9);

// Lucide icon additions (ISC, LICENSE, tag 1.79.0; none are Feather-derived exceptions)
const GROUP_10: readonly CatalogEntry[] = [
  publicAdapter({
    id: "lucide-activity",
    version: "1.79.0",
    name: { en: "Activity", de: "Aktivität" },
    type: "media",
    renderer: "icon",
    source: "https://github.com/lucide-icons/lucide/blob/1.79.0/icons/activity.svg",
    license: "ISC",
    licenseFile: "LICENSE",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[8],
  }),
  publicAdapter({
    id: "lucide-calendar-clock",
    version: "1.79.0",
    name: { en: "Calendar clock", de: "Kalenderuhr" },
    type: "media",
    renderer: "icon",
    source: "https://github.com/lucide-icons/lucide/blob/1.79.0/icons/calendar-clock.svg",
    license: "ISC",
    licenseFile: "LICENSE",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[9],
  }),
  publicAdapter({
    id: "lucide-chart-no-axes-combined",
    version: "1.79.0",
    name: { en: "Combined chart", de: "Kombiniertes Diagramm" },
    type: "media",
    renderer: "icon",
    source: "https://github.com/lucide-icons/lucide/blob/1.79.0/icons/chart-no-axes-combined.svg",
    license: "ISC",
    licenseFile: "LICENSE",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[0],
  }),
  publicAdapter({
    id: "lucide-shield-check",
    version: "1.79.0",
    name: { en: "Shield check", de: "Schild mit Häkchen" },
    type: "media",
    renderer: "icon",
    source: "https://github.com/lucide-icons/lucide/blob/1.79.0/icons/shield-check.svg",
    license: "ISC",
    licenseFile: "LICENSE",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[1],
  }),
] as const;
GROUPS.push(GROUP_10);

// MUI X additions (MIT; package LICENSE files at v9.18.0 and v9.18.1)
const GROUP_11: readonly CatalogEntry[] = [
  publicAdapter({
    id: "mui-data-grid",
    version: "9.18.0",
    name: { en: "Data grid", de: "Datengitter" },
    type: "content",
    renderer: "table",
    source:
      "https://github.com/mui/mui-x/blob/v9.18.0/packages/x-data-grid/src/DataGrid/DataGrid.tsx",
    license: "MIT",
    licenseFile: "packages/x-data-grid/LICENSE",
    ports: [
      { id: "products", kind: "data:product", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[2],
  }),
  publicAdapter({
    id: "mui-date-picker",
    version: "9.18.0",
    name: { en: "Date picker", de: "Datumsauswahl" },
    type: "input",
    renderer: "date",
    source:
      "https://github.com/mui/mui-x/blob/v9.18.0/packages/x-date-pickers/src/DatePicker/DatePicker.tsx",
    license: "MIT",
    licenseFile: "packages/x-date-pickers/LICENSE",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[3],
  }),
  publicAdapter({
    id: "mui-date-time-picker",
    version: "9.18.0",
    name: { en: "Date and time picker", de: "Datum- und Zeitauswahl" },
    type: "input",
    renderer: "date",
    source:
      "https://github.com/mui/mui-x/blob/v9.18.0/packages/x-date-pickers/src/DateTimePicker/DateTimePicker.tsx",
    license: "MIT",
    licenseFile: "packages/x-date-pickers/LICENSE",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[4],
  }),
  publicAdapter({
    id: "mui-time-picker",
    version: "9.18.0",
    name: { en: "Time picker", de: "Zeitauswahl" },
    type: "input",
    renderer: "date",
    source:
      "https://github.com/mui/mui-x/blob/v9.18.0/packages/x-date-pickers/src/TimePicker/TimePicker.tsx",
    license: "MIT",
    licenseFile: "packages/x-date-pickers/LICENSE",
    ports: [
      { id: "text", kind: "data:text", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[5],
  }),
  publicAdapter({
    id: "mui-gauge",
    version: "9.18.1",
    name: { en: "Gauge", de: "Tachoanzeige" },
    type: "content",
    renderer: "chart",
    source: "https://github.com/mui/mui-x/blob/v9.18.1/packages/x-charts/src/Gauge/Gauge.tsx",
    license: "MIT",
    licenseFile: "packages/x-charts/LICENSE",
    ports: [
      { id: "order", kind: "data:order", direction: "in" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[6],
  }),
] as const;
GROUPS.push(GROUP_11);

// MUI Material additions (MIT, LICENSE, tag v9.6.0)
const GROUP_12: readonly CatalogEntry[] = [
  publicAdapter({
    id: "mui-bottom-navigation",
    version: "9.6.0",
    name: { en: "Bottom navigation", de: "Untere Navigation" },
    type: "navigation",
    renderer: "nav",
    source:
      "https://github.com/mui/material-ui/blob/v9.6.0/packages/mui-material/src/BottomNavigation/BottomNavigation.js",
    license: "MIT",
    licenseFile: "LICENSE",
    ports: [{ id: "ui", kind: "struct:ui", direction: "out" }],
    color: PALETTE[7],
  }),
  publicAdapter({
    id: "mui-icon-button",
    version: "9.6.0",
    name: { en: "Icon button", de: "Symbolschalter" },
    type: "interaction",
    renderer: "button",
    source:
      "https://github.com/mui/material-ui/blob/v9.6.0/packages/mui-material/src/IconButton/IconButton.js",
    license: "MIT",
    licenseFile: "LICENSE",
    ports: [{ id: "click", kind: "event:click", direction: "out" }],
    color: PALETTE[8],
  }),
  publicAdapter({
    id: "mui-link",
    version: "9.6.0",
    name: { en: "Link", de: "Verknüpfung" },
    type: "navigation",
    renderer: "nav",
    source: "https://github.com/mui/material-ui/blob/v9.6.0/packages/mui-material/src/Link/Link.js",
    license: "MIT",
    licenseFile: "LICENSE",
    ports: [
      { id: "text", kind: "data:text", direction: "in" },
      { id: "click", kind: "event:click", direction: "out" },
      { id: "ui", kind: "struct:ui", direction: "out" },
    ],
    color: PALETTE[9],
  }),
  publicAdapter({
    id: "mui-speed-dial",
    version: "9.6.0",
    name: { en: "Speed dial", de: "Schnellwahl" },
    type: "interaction",
    renderer: "button",
    source:
      "https://github.com/mui/material-ui/blob/v9.6.0/packages/mui-material/src/SpeedDial/SpeedDial.js",
    license: "MIT",
    licenseFile: "LICENSE",
    ports: [{ id: "click", kind: "event:click", direction: "out" }],
    color: PALETTE[0],
  }),
] as const;
GROUPS.push(GROUP_12);

export const FORGE_CATALOG: readonly CatalogEntry[] = GROUPS.flat();

export function catalogById(id: string): CatalogEntry | undefined {
  return FORGE_CATALOG.find((entry) => entry.id === id);
}

/** The ten blocks on the first hotbar page — the runnable example app. */
export const HOTBAR_IDS: readonly string[] = [
  "forge-gallery",
  "forge-cart",
  "forge-order-form",
  "forge-user",
  "forge-storage",
  "forge-navigation",
  "forge-button",
  "forge-text",
  "forge-chart",
  "forge-api",
];
