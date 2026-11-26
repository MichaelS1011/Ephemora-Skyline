import type { ForgeNode } from "./contracts";

export type ForgeLang = "en" | "de";

const COPY = {
  "language.label": { en: "Language", de: "Sprache" },
  "language.english": { en: "Switch to English", de: "Auf Englisch wechseln" },
  "language.german": { en: "Switch to German", de: "Auf Deutsch wechseln" },

  "common.back": { en: "Back", de: "Zurück" },
  "common.close": { en: "Close", de: "Schließen" },
  "common.cancel": { en: "Cancel", de: "Abbrechen" },
  "common.export": { en: "Export project", de: "Projekt exportieren" },
  "common.reset": { en: "Start over", de: "Neu beginnen" },
  "common.unnamed": { en: "Untitled project", de: "Unbenanntes Projekt" },

  "mode.title": {
    en: "Build a city. Or build software.",
    de: "Erkunde eine Stadt. Oder baue Software.",
  },
  "mode.sub": {
    en: "Explore a local project as a city, or build a working app from simple blocks.",
    de: "Erkunde ein lokales Projekt als Stadt oder baue aus einfachen Bausteinen eine funktionierende App.",
  },
  "mode.exploreIndex": { en: "01 / EXPLORE", de: "01 / ERKUNDEN" },
  "mode.exploreTitle": { en: "Explore software", de: "Software erkunden" },
  "mode.exploreBody": {
    en: "Walk through a city generated from your project. Nothing is uploaded.",
    de: "Gehe durch eine Stadt aus deinem Projekt. Nichts wird hochgeladen.",
  },
  "mode.exploreCta": { en: "Enter the city →", de: "Stadt betreten →" },
  "mode.buildIndex": { en: "02 / BUILD", de: "02 / BAUEN" },
  "mode.buildTitle": { en: "Build software", de: "Software bauen" },
  "mode.buildBody": {
    en: "Place blocks, connect them and test the result. Export it when you are happy.",
    de: "Platziere Bausteine, verbinde sie und teste das Ergebnis. Exportiere es, wenn es passt.",
  },
  "mode.buildCta": { en: "Open FORGE →", de: "FORGE öffnen →" },
  "mode.local": {
    en: "Local-first. No account. No telemetry.",
    de: "Lokal. Ohne Konto. Ohne Telemetrie.",
  },
  "mode.loading": { en: "Loading FORGE …", de: "FORGE wird geladen …" },

  "starter.kicker": { en: "FORGE · START", de: "FORGE · START" },
  "starter.title": { en: "What do you want to build?", de: "Was willst du bauen?" },
  "starter.body": {
    en: "Choose a ready-made starting point. You can change every block, connect it or replace it.",
    de: "Wähle einen fertigen Startpunkt. Du kannst jeden Baustein ändern, verbinden oder ersetzen.",
  },
  "starter.local": {
    en: "Everything runs locally. No account, no upload and no downloaded component code.",
    de: "Alles läuft lokal. Ohne Konto, Upload oder geladenen Bausteincode.",
  },
  "starter.blank": { en: "Start with an empty project →", de: "Mit leerem Projekt starten →" },

  "phase.build": { en: "Build", de: "Bauen" },
  "phase.connect": { en: "Connect", de: "Verbinden" },
  "phase.test": { en: "Test", de: "Testen" },
  "phase.aria": { en: "Project steps", de: "Projektschritte" },
  "phase.count": { en: "Step {current} of 3", de: "Schritt {current} von 3" },

  "action.undo": { en: "Undo", de: "Rückgängig" },
  "action.redo": { en: "Redo", de: "Wiederholen" },
  "action.inventory": { en: "Blocks", de: "Bausteine" },
  "action.test": { en: "Test project", de: "Projekt testen" },
  "action.closeTest": { en: "Back to building", de: "Zurück zum Bauen" },

  "objective.buildPlace": {
    en: "Click a free grid square to place {block}.",
    de: "Klicke auf ein freies Rasterfeld, um {block} zu platzieren.",
  },
  "objective.buildReady": {
    en: "Ready to test. Open the preview and try your project.",
    de: "Bereit zum Testen. Öffne die Vorschau und probiere dein Projekt aus.",
  },
  "objective.connectMissing": {
    en: "Open Connections and link the missing input: {message}",
    de: "Öffne Verbinden und verbinde den fehlenden Eingang: {message}",
  },
  "objective.connectReady": {
    en: "All required inputs are connected. You can add more links or test the result.",
    de: "Alle erforderlichen Eingänge sind verbunden. Du kannst weitere Verbindungen hinzufügen oder testen.",
  },
  "objective.test": {
    en: "Use the preview like a real app. Everything stays in this browser.",
    de: "Nutze die Vorschau wie eine echte App. Alles bleibt in diesem Browser.",
  },
  "objective.metaOne": {
    en: "{blocks} block · {connections} link",
    de: "{blocks} Baustein · {connections} Verbindung",
  },
  "objective.metaMany": {
    en: "{blocks} blocks · {connections} links",
    de: "{blocks} Bausteine · {connections} Verbindungen",
  },

  "readiness.one": { en: "One connection is missing.", de: "Eine Verbindung fehlt." },
  "readiness.many": { en: "{count} connections are missing.", de: "{count} Verbindungen fehlen." },
  "readiness.connect": { en: "Connect now →", de: "Jetzt verbinden →" },

  "controls.build": {
    en: "WASD move · Mouse/arrows look · Click/Enter place · Right-click/Delete remove · Space/C up/down",
    de: "WASD gehen · Maus/Pfeile umsehen · Klick/Enter platzieren · Rechtsklick/Delete entfernen · Leertaste/C hoch/runter",
  },
  "controls.connect": {
    en: "Click a block · Choose an output · Choose a matching input",
    de: "Baustein anklicken · Ausgang wählen · Passenden Eingang wählen",
  },
  "hotbar.aria": { en: "Quick block selection", de: "Schnelle Bausteinauswahl" },

  "inventory.kicker": { en: "BLOCK LIBRARY", de: "BAUSTEINBIBLIOTHEK" },
  "inventory.title": { en: "Choose a block", de: "Baustein wählen" },
  "inventory.simple": {
    en: "Start with these {count} essential blocks. Adapters never download external code.",
    de: "Starte mit diesen {count} Basisbausteinen. Adapter laden keinen fremden Code.",
  },
  "inventory.all": { en: "Show all {count} blocks", de: "Alle {count} Bausteine anzeigen" },
  "inventory.essential": { en: "Show essential blocks only", de: "Nur Basisbausteine anzeigen" },
  "inventory.search": { en: "Search blocks …", de: "Bausteine suchen …" },
  "inventory.searchAria": { en: "Search blocks", de: "Bausteine suchen" },
  "inventory.noResults": {
    en: "No blocks match your search.",
    de: "Keine Bausteine passen zur Suche.",
  },
  "inventory.native": { en: "Ready to use", de: "Direkt verwendbar" },
  "inventory.adapter": { en: "{renderer} adapter", de: "{renderer}-Adapter" },
  "inventory.reset": { en: "Start a new project", de: "Neues Projekt beginnen" },

  "connect.kicker": { en: "STEP 2", de: "SCHRITT 2" },
  "connect.title": { en: "Connect blocks", de: "Bausteine verbinden" },
  "connect.close": { en: "Close connections", de: "Verbindungen schließen" },
  "connect.intro": {
    en: "Choose a block, then one output and a matching free input.",
    de: "Wähle einen Baustein, dann einen Ausgang und einen passenden freien Eingang.",
  },
  "connect.block": { en: "Block", de: "Baustein" },
  "connect.outputs": { en: "Outputs", de: "Ausgänge" },
  "connect.noOutputs": {
    en: "This block has no outputs.",
    de: "Dieser Baustein hat keine Ausgänge.",
  },
  "connect.chooseTarget": { en: "Where should {port} go?", de: "Wohin soll {port}?" },
  "connect.noTarget": {
    en: "No matching input is free. Add the missing block first.",
    de: "Kein passender Eingang ist frei. Füge zuerst den fehlenden Baustein hinzu.",
  },
  "connect.inputs": { en: "Inputs", de: "Eingänge" },
  "connect.noInputs": {
    en: "This block has no inputs.",
    de: "Dieser Baustein hat keine Eingänge.",
  },
  "connect.required": { en: "Required", de: "Erforderlich" },
  "connect.optional": { en: "Optional", de: "Optional" },
  "connect.connected": { en: "Connected", de: "Verbunden" },
  "connect.disconnect": { en: "Disconnect", de: "Trennen" },
  "connect.input": { en: "Input: {port}", de: "Eingang: {port}" },
  "connect.emptyWorld": {
    en: "Place a block in the world first.",
    de: "Platziere zuerst einen Baustein in der Welt.",
  },
  "connect.none": { en: "No connections yet.", de: "Noch keine Verbindungen." },
  "connect.countOne": { en: "1 connection", de: "1 Verbindung" },
  "connect.countMany": { en: "{count} connections", de: "{count} Verbindungen" },
  "connect.disconnectAria": {
    en: "Disconnect connection {number}",
    de: "Verbindung {number} trennen",
  },

  "test.kicker": { en: "STEP 3 · YOUR RESULT", de: "SCHRITT 3 · DEIN ERGEBNIS" },
  "test.title": { en: "Try your project.", de: "Teste dein Projekt." },
  "test.name": { en: "Project name", de: "Projektname" },
  "test.blockedTitle": { en: "Connections are still missing.", de: "Es fehlen noch Verbindungen." },
  "test.openConnections": { en: "Open connections", de: "Verbindungen öffnen" },
  "test.task": { en: "Quick check", de: "Kurzer Test" },
  "test.local": {
    en: "The preview runs only in this browser. Nothing is uploaded.",
    de: "Die Vorschau läuft nur in diesem Browser. Nichts wird hochgeladen.",
  },
  "test.preview": { en: "PREVIEW", de: "VORSCHAU" },
  "test.back": { en: "← Back to building", de: "← Zurück zum Bauen" },
  "test.website1": {
    en: "Check the navigation and text on desktop.",
    de: "Prüfe Navigation und Text in der Desktop-Ansicht.",
  },
  "test.website2": {
    en: "Click “Start a project” and watch the counter.",
    de: "Klicke auf „Projekt starten“ und beobachte den Zähler.",
  },
  "test.website3": {
    en: "Switch to Mobile and check that everything stays readable.",
    de: "Wechsle zu Mobile und prüfe, ob alles lesbar bleibt.",
  },
  "test.shop1": { en: "Add a product to the cart.", de: "Füge ein Produkt zum Warenkorb hinzu." },
  "test.shop2": {
    en: "Place an order and check the success message.",
    de: "Sende eine Bestellung und prüfe die Erfolgsmeldung.",
  },
  "test.shop3": {
    en: "Check that the order count increases and the cart clears.",
    de: "Prüfe, ob der Bestellzähler steigt und der Warenkorb leer wird.",
  },
  "test.app1": {
    en: "Try each visible block once.",
    de: "Bediene jeden sichtbaren Baustein einmal.",
  },
  "test.app2": {
    en: "Check the input, chart and table.",
    de: "Prüfe Eingabe, Diagramm und Tabelle.",
  },
  "test.app3": {
    en: "Change the view size and fix any missing links.",
    de: "Wechsle die Ansichtsgröße und korrigiere fehlende Verbindungen.",
  },

  "runtime.preview": {
    en: "Your graph runs as real React components",
    de: "Dein Graph läuft als echte React-Komponenten",
  },
  "runtime.add": { en: "Add", de: "Hinzufügen" },
  "runtime.clear": { en: "Clear", de: "Leeren" },
  "runtime.cart": { en: "Cart", de: "Warenkorb" },
  "runtime.order": { en: "Order", de: "Bestellung" },
  "runtime.send": { en: "Place order", de: "Bestellung senden" },
  "runtime.orders": { en: "Orders", de: "Bestellungen" },
  "runtime.user": { en: "Local demo user", de: "Lokaler Beispielbenutzer" },
  "runtime.noCart": {
    en: "Connect a product source to this cart.",
    de: "Verbinde eine Produktquelle mit diesem Warenkorb.",
  },
  "runtime.noUser": {
    en: "Connect a user block to this order form.",
    de: "Verbinde einen Benutzerbaustein mit diesem Bestellformular.",
  },
  "runtime.needs": {
    en: "Connect the required inputs to run the whole app.",
    de: "Verbinde die erforderlichen Eingänge für die ganze Anwendung.",
  },
  "runtime.clickOne": { en: "click", de: "Klick" },
  "runtime.clickMany": { en: "clicks", de: "Klicks" },
  "runtime.local": { en: "local state only", de: "nur lokaler Zustand" },
  "runtime.date": { en: "Today", de: "Heute" },
  "runtime.desktop": { en: "Desktop", de: "Desktop" },
  "runtime.mobile": { en: "Mobile", de: "Mobile" },
  "runtime.ready": { en: "Ready", de: "Bereit" },
  "runtime.success": {
    en: "Order saved locally. The cart is empty again.",
    de: "Bestellung lokal gespeichert. Der Warenkorb ist wieder leer.",
  },
  "runtime.lastUser": { en: "Last user", de: "Letzter Benutzer" },
  "runtime.viewSize": { en: "Preview size", de: "Ansichtsgröße" },
  "runtime.projectCheck": { en: "Project checks", de: "Projektprüfung" },
  "runtime.blocks": { en: "Blocks present", de: "Bausteine vorhanden" },
  "runtime.ports": { en: "Connections ready", de: "Verbindungen bereit" },
  "runtime.flow": { en: "Test flow available", de: "Testfluss möglich" },

  "world.aria": { en: "Walkable building world", de: "Begehbare Bauwelt" },
  "world.canvas": { en: "3D building world", de: "3D-Bauwelt" },
  "world.viewToggle": { en: "Third-person view", de: "Dritte-Person-Ansicht" },
  "world.target": { en: "Target {x} · {z} · level {level}", de: "Ziel {x} · {z} · Ebene {level}" },
  "world.targetBlock": { en: "{target} · {block}", de: "{target} · {block}" },
  "world.outOfReach": { en: "No target in reach", de: "Kein Ziel in Reichweite" },
  "world.locked": {
    en: "Mouse active · WASD move · Shift run · Space up · C down",
    de: "Maus aktiv · WASD gehen · Shift rennen · Leertaste hoch · C runter",
  },
  "world.unlocked": {
    en: "Click places a block and captures the mouse · Arrow keys also work without mouse lock",
    de: "Klick platziert und aktiviert die Maus · Pfeiltasten funktionieren auch ohne Mausfang",
  },

  "notice.templateLoaded": {
    en: "Template loaded. You can change every block.",
    de: "Vorlage geladen. Du kannst jeden Baustein verändern.",
  },
  "notice.occupied": {
    en: "This square is occupied. Choose a free one.",
    de: "Dieses Feld ist belegt. Wähle ein freies.",
  },
  "notice.invalidCell": {
    en: "Choose a free square inside the build area.",
    de: "Wähle ein freies Feld innerhalb der Baufläche.",
  },
  "notice.placed": { en: "Block placed.", de: "Baustein platziert." },
  "notice.empty": { en: "There is no block here.", de: "Hier steht kein Baustein." },
  "notice.removed": { en: "Block removed.", de: "Baustein entfernt." },
  "notice.connected": { en: "Connection created.", de: "Verbindung hergestellt." },
  "notice.disconnected": { en: "Connection removed.", de: "Verbindung entfernt." },
  "notice.undone": { en: "Last change undone.", de: "Letzte Änderung rückgängig gemacht." },
  "notice.redone": { en: "Change restored.", de: "Änderung wiederhergestellt." },

  "export.download": {
    en: "ZIP saved locally ({count} files).",
    de: "ZIP lokal gespeichert ({count} Dateien).",
  },
  "export.directory": {
    en: "{count} files saved in the selected folder.",
    de: "{count} Dateien im gewählten Ordner gespeichert.",
  },
  "export.failed": {
    en: "Export failed. Please try again.",
    de: "Export fehlgeschlagen. Bitte versuche es erneut.",
  },
  "export.folder": { en: "Selected folder", de: "Gewählter Ordner" },
  "export.readmeGenerated": {
    en: "Generated from an Ephemora Skyline BUILD graph.",
    de: "Aus einem Ephemora-Skyline-BUILD-Graphen erzeugt.",
  },
  "export.readmeRun": {
    en: "Run `npm install && npm run dev`.",
    de: "Starte mit `npm install && npm run dev`.",
  },
  "export.readmeGraph": {
    en: "`src/graph.json` is the same data the BUILD world used.",
    de: "`src/graph.json` enthält dieselben Daten wie die BUILD-Welt.",
  },
  "export.readmeRuntime": {
    en: "`src/runtime.tsx` is the same component the preview used.",
    de: "`src/runtime.tsx` ist dieselbe Komponente wie in der Vorschau.",
  },
  "export.readmeLocal": {
    en: "No fetched code, no telemetry and no backend.",
    de: "Kein geladener Code, keine Telemetrie und kein Backend.",
  },
  "export.noticeTitle": { en: "Credits", de: "Danksagungen" },
  "export.noticeRuntime": {
    en: "The runtime adapters are Ephemora code (Apache-2.0) built on React 19 (MIT).",
    de: "Die Runtime-Adapter sind Ephemora-Code (Apache-2.0) auf Basis von React 19 (MIT).",
  },
  "export.noticeCatalog": {
    en: "The source catalog records the upstream component, version and license behind each block.",
    de: "Der Quellkatalog dokumentiert zu jedem Baustein die zugrunde liegende Komponente, Version und Lizenz.",
  },
  "export.noticeThirdParty": {
    en: "This generated project does not bundle third-party component source.",
    de: "Dieses erzeugte Projekt enthält keinen Quellcode fremder Komponenten.",
  },

  "reset.title": { en: "Start a new project?", de: "Neues Projekt beginnen?" },
  "reset.body": {
    en: "All blocks and connections will be deleted. Back keeps your project; starting over needs confirmation.",
    de: "Alle Bausteine und Verbindungen werden gelöscht. Zurück behält dein Projekt; der Neustart braucht deine Bestätigung.",
  },
  "reset.confirm": { en: "Delete and start over", de: "Löschen und neu beginnen" },

  "port.products": { en: "Products", de: "Produkte" },
  "port.text": { en: "Text", de: "Text" },
  "port.user": { en: "User", de: "Benutzer" },
  "port.order": { en: "Order", de: "Bestellung" },
  "port.store": { en: "Saved data", de: "Gespeicherte Daten" },
  "port.click": { en: "Click", de: "Klick" },
  "port.submit": { en: "Submit", de: "Absenden" },
  "port.ui": { en: "Interface", de: "Oberfläche" },
} as const;

export type ForgeTextKey = keyof typeof COPY;

export function forgeText(
  lang: ForgeLang,
  key: ForgeTextKey,
  vars?: Record<string, string | number>,
): string {
  const text: string = COPY[key][lang];
  if (!vars) return text;
  return Object.entries(vars).reduce(
    (result, [name, value]) => result.split(`{${name}}`).join(String(value)),
    text,
  );
}

export function forgeCount(lang: ForgeLang, count: number): string {
  return count.toLocaleString(lang === "de" ? "de-DE" : "en-US");
}

export function portName(lang: ForgeLang, portId: string): string {
  const key = `port.${portId}` as ForgeTextKey;
  return key in COPY ? forgeText(lang, key) : portId;
}

const TEMPLATE_NODE_LABELS: Record<string, { en: string; de: string }> = {
  "site-nav": { en: "Studio Nord", de: "Studio Nord" },
  "site-hero": { en: "Welcome", de: "Willkommen" },
  "site-services": { en: "Services", de: "Leistungen" },
  "site-work": { en: "Selected work", de: "Ausgewählte Arbeiten" },
  "site-cta": { en: "Start a project", de: "Projekt starten" },
  "shop-nav": { en: "FORGE SUPPLY", de: "FORGE SUPPLY" },
  "shop-products": { en: "Products", de: "Produkte" },
  "shop-cart": { en: "Cart", de: "Warenkorb" },
  "shop-user": { en: "Customer", de: "Kundschaft" },
  "shop-checkout": { en: "Checkout", de: "Bestellung abschließen" },
  "shop-orders": { en: "Orders", de: "Bestellungen" },
  "shop-chart": { en: "Order history", de: "Bestellverlauf" },
  "app-nav": { en: "Workshop overview", de: "Werkstatt · Übersicht" },
  "app-metrics": { en: "Activity", de: "Aktivität" },
  "app-input": { en: "Project name", de: "Projektname" },
  "app-table": { en: "Projects", de: "Projekte" },
  "app-action": { en: "Create a job", de: "Neuen Auftrag anlegen" },
};

const TEMPLATE_NODE_CONTENT: Record<string, { en: string; de: string }> = {
  ...TEMPLATE_NODE_LABELS,
  "site-hero": {
    en: "Software that gets better up close. We design digital products with clarity, character and care for detail.",
    de: "Software, die aus der Nähe besser wird. Wir gestalten digitale Produkte mit Klarheit, Haltung und Liebe zum Detail.",
  },
  "site-services": {
    en: "Strategy, design and development from one team. From the first sketch to the finished product.",
    de: "Strategie, Design und Entwicklung aus einer Hand. Von der ersten Skizze bis zum fertigen Produkt.",
  },
};

const PORTFOLIO_META: Record<string, { en: string; de: string }> = {
  nordlicht: { en: "Brand · Digital", de: "Marke · Digital" },
  kontur: { en: "Product · Experience", de: "Produkt · Erfahrung" },
  freiraum: { en: "Platform · Identity", de: "Plattform · Identität" },
};

export function templateNodeLabel(node: ForgeNode, lang: ForgeLang): string | undefined {
  return TEMPLATE_NODE_LABELS[node.id]?.[lang];
}

export function templateNodeContent(node: ForgeNode, lang: ForgeLang): string | undefined {
  return TEMPLATE_NODE_CONTENT[node.id]?.[lang];
}

export function nodeLabel(
  node: ForgeNode,
  lang: ForgeLang,
  entryName?: { en: string; de: string },
): string {
  const templateLabel = TEMPLATE_NODE_LABELS[node.id]?.[lang];
  if (templateLabel) return templateLabel;
  if (entryName && (node.label === entryName.en || node.label === entryName.de)) {
    return entryName[lang];
  }
  return node.label;
}

export function portfolioMeta(id: string, lang: ForgeLang): string {
  return PORTFOLIO_META[id]?.[lang] ?? "";
}
