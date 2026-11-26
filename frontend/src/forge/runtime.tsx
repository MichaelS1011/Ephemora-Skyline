/** The one real execution path for a FORGE graph. No eval or remote imports. */
import { useMemo, useState } from "react";
import "./runtime.css";
import { catalogById } from "./catalog";
import type { FORGE_CATALOG } from "./catalog";
import {
  DEFAULT_PROJECT,
  type ForgeGraph,
  type ForgeNode,
  type ForgeProject,
  type RendererFamily,
} from "./contracts";
import { inputSource, readiness } from "./validate";
import { forgeText, nodeLabel, portfolioMeta, templateNodeContent, type ForgeLang } from "./i18n";

type Product = { id: string; name: string; price: number };

const PRODUCTS: readonly Product[] = [
  { id: "p1", name: "SENSOR", price: 19 },
  { id: "p2", name: "GATEWAY", price: 49 },
  { id: "p3", name: "RELAY", price: 29 },
];

const PORTFOLIO: readonly { id: string; name: string }[] = [
  { id: "nordlicht", name: "Nordlicht" },
  { id: "kontur", name: "Kontur" },
  { id: "freiraum", name: "Freiraum" },
];

type RuntimeBinding = {
  cartId?: string;
  userId?: string;
  galleryCartIds: readonly string[];
};

const DEFAULT_USER = "Ada";

export type ProjectCheck = { readonly id: string; readonly label: string; readonly pass: boolean };

export function projectChecks(
  graph: ForgeGraph,
  project: ForgeProject,
  lang: ForgeLang,
): ProjectCheck[] {
  const families = graph.nodes.map((node) => catalogById(node.catalogId)?.renderer ?? "text");
  const required = readiness(graph, lang).length === 0;
  const flow =
    project.kind === "website"
      ? families.includes("nav") && families.includes("text") && families.includes("button")
      : project.kind === "shop"
        ? ["gallery", "cart", "form", "user"].every((family) =>
            families.includes(family as RendererFamily),
          )
        : graph.nodes.length >= 2;
  return [
    {
      id: "blocks",
      label: forgeText(lang, "runtime.blocks"),
      pass: graph.nodes.length > 0,
    },
    {
      id: "ports",
      label: forgeText(lang, "runtime.ports"),
      pass: required,
    },
    {
      id: "flow",
      label: forgeText(lang, "runtime.flow"),
      pass: flow && required,
    },
  ];
}

export function ForgeRuntime({
  graph,
  lang = "en",
  project = DEFAULT_PROJECT,
}: {
  graph: ForgeGraph;
  lang?: ForgeLang;
  project?: ForgeProject;
}) {
  const t = {
    preview: forgeText(lang, "runtime.preview"),
    add: forgeText(lang, "runtime.add"),
    clear: forgeText(lang, "runtime.clear"),
    cart: forgeText(lang, "runtime.cart"),
    order: forgeText(lang, "runtime.order"),
    send: forgeText(lang, "runtime.send"),
    orders: forgeText(lang, "runtime.orders"),
    user: forgeText(lang, "runtime.user"),
    noCart: forgeText(lang, "runtime.noCart"),
    noUser: forgeText(lang, "runtime.noUser"),
    needs: forgeText(lang, "runtime.needs"),
    local: forgeText(lang, "runtime.local"),
    date: forgeText(lang, "runtime.date"),
    desktop: forgeText(lang, "runtime.desktop"),
    mobile: forgeText(lang, "runtime.mobile"),
    success: forgeText(lang, "runtime.success"),
  };
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [carts, setCarts] = useState<Record<string, readonly string[]>>({});
  const [orders, setOrders] = useState<readonly { at: string; user: string; cartId: string }[]>([]);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [clicks, setClicks] = useState<Record<string, number>>({});
  const [users, setUsers] = useState<Record<string, string>>({});
  const [confirmations, setConfirmations] = useState<Record<string, number>>({});

  const entries = useMemo(
    () =>
      graph.nodes
        .map((node) => ({ node, entry: catalogById(node.catalogId) }))
        .sort((a, b) => (a.node.cell[2] ?? 0) - (b.node.cell[2] ?? 0)),
    [graph.nodes],
  );
  const missing = useMemo(() => readiness(graph, lang), [graph, lang]);
  const checks = useMemo(() => projectChecks(graph, project, lang), [graph, project, lang]);
  const bindings = useMemo(() => {
    const result = new Map<string, RuntimeBinding>();
    const cartsByGallery = new Map<string, string[]>();
    for (const { node, entry } of entries) {
      if (entry?.renderer !== "cart") continue;
      const source = inputSource(graph, node.id, "products");
      if (!source) continue;
      const targets = cartsByGallery.get(source.id) ?? [];
      targets.push(node.id);
      cartsByGallery.set(source.id, targets);
    }
    for (const { node, entry } of entries) {
      if (entry?.renderer === "gallery") {
        result.set(node.id, { galleryCartIds: cartsByGallery.get(node.id) ?? [] });
      } else if (entry?.renderer === "form") {
        const orderSource = inputSource(graph, node.id, "order");
        const userSource = inputSource(graph, node.id, "user");
        result.set(node.id, {
          cartId:
            orderSource && catalogById(orderSource.catalogId)?.renderer === "cart"
              ? orderSource.id
              : undefined,
          userId:
            userSource && catalogById(userSource.catalogId)?.renderer === "user"
              ? userSource.id
              : undefined,
          galleryCartIds: [],
        });
      }
    }
    return result;
  }, [entries, graph]);

  const render = ({ node, entry }: { node: ForgeNode; entry?: (typeof FORGE_CATALOG)[number] }) => {
    const key = node.id;
    const family: RendererFamily = entry?.renderer ?? "text";
    const label = entry?.name[lang] ?? nodeLabel(node, lang);
    const binding = bindings.get(key) ?? { galleryCartIds: [] };
    const customLabel =
      templateNodeContent(node, lang) ??
      (node.label && node.label !== entry?.name.de && node.label !== entry?.name.en
        ? node.label
        : undefined);
    switch (family) {
      case "nav":
        return (
          <header key={key} className="forge-runtime-nav" aria-label={customLabel ?? label}>
            <span className="forge-runtime-mark">◆ {project.name}</span>
            <span>{customLabel ?? label}</span>
          </header>
        );
      case "button":
        return (
          <button
            key={key}
            type="button"
            className="forge-runtime-button"
            onClick={() => setClicks((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }))}
          >
            {customLabel ?? label} · {clicks[key] ?? 0}{" "}
            {forgeText(lang, (clicks[key] ?? 0) === 1 ? "runtime.clickOne" : "runtime.clickMany")}
          </button>
        );
      case "text": {
        const copy = customLabel ?? entry?.description[lang] ?? node.label;
        return project.kind === "website" ? (
          <section
            key={key}
            className={node.cell[2] === 1 ? "forge-runtime-hero" : "forge-runtime-section"}
          >
            {copy}
          </section>
        ) : (
          <p key={key} className="forge-runtime-text">
            {copy}
          </p>
        );
      }
      case "gallery": {
        const items: readonly { id: string; name: string; meta: string }[] =
          project.kind === "website"
            ? PORTFOLIO.map((item) => ({
                id: item.id,
                name: item.name,
                meta: portfolioMeta(item.id, lang),
              }))
            : PRODUCTS.map((product) => ({
                id: product.id,
                name: product.name,
                meta: `${product.price} CHF`,
              }));
        return (
          <section key={key} className="forge-runtime-card" data-node-id={key}>
            <h4>{customLabel ?? label}</h4>
            <ul className="forge-runtime-list">
              {items.map((item) => (
                <li key={item.id}>
                  <span>{item.name}</span>
                  <span>{item.meta}</span>
                  {project.kind !== "website" && (
                    <button
                      type="button"
                      disabled={binding.galleryCartIds.length === 0}
                      onClick={() =>
                        setCarts((prev) => {
                          const next = { ...prev };
                          for (const cartId of binding.galleryCartIds) {
                            next[cartId] = [...(next[cartId] ?? []), item.id];
                          }
                          return next;
                        })
                      }
                      title={binding.galleryCartIds.length > 0 ? t.add : t.noCart}
                    >
                      {t.add}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      }
      case "cart": {
        const items = carts[key] ?? [];
        const total = items.reduce(
          (sum, id) => sum + (PRODUCTS.find((product) => product.id === id)?.price ?? 0),
          0,
        );
        return (
          <section
            key={key}
            className="forge-runtime-card"
            data-testid="forge-cart"
            data-node-id={key}
          >
            <h4>{t.cart}</h4>
            <p data-testid="forge-cart-total">{total} CHF</p>
            <button
              type="button"
              onClick={() => setCarts((prev) => ({ ...prev, [key]: [] }))}
              disabled={items.length === 0}
            >
              {t.clear}
            </button>
          </section>
        );
      }
      case "form": {
        const { cartId, userId } = binding;
        const textKey = `form:${key}:order`;
        const canOrder = !!cartId && !!userId && (carts[cartId!]?.length ?? 0) > 0;
        return (
          <form
            key={key}
            className="forge-runtime-card"
            onSubmit={(event) => {
              event.preventDefault();
              if (!cartId || !userId || (carts[cartId]?.length ?? 0) === 0) return;
              setOrders((prev) => [
                ...prev,
                {
                  at: new Date().toISOString(),
                  user: users[userId] ?? DEFAULT_USER,
                  cartId,
                },
              ]);
              setConfirmations((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
              setCarts((prev) => ({ ...prev, [cartId]: [] }));
            }}
            data-testid="forge-order-form"
            data-node-id={key}
          >
            <h4>{customLabel ?? label}</h4>
            {!!confirmations[key] && (
              <p className="forge-runtime-order-success" role="status">
                {t.success}
              </p>
            )}
            <input
              aria-label={t.order}
              value={texts[textKey] ?? ""}
              onChange={(event) => setTexts((prev) => ({ ...prev, [textKey]: event.target.value }))}
              placeholder={t.order}
            />
            <button type="submit" disabled={!canOrder} title={!userId ? t.noUser : ""}>
              {t.send}
            </button>
            {!cartId && <small>{t.needs}</small>}
            {!userId && <small>{t.noUser}</small>}
          </form>
        );
      }
      case "user":
        return (
          <section key={key} className="forge-runtime-card" data-node-id={key}>
            <h4>{label}</h4>
            <select
              value={users[key] ?? DEFAULT_USER}
              onChange={(event) => setUsers((prev) => ({ ...prev, [key]: event.target.value }))}
              aria-label={t.user}
              data-testid="forge-user"
            >
              <option value="Ada">Ada</option>
              <option value="Lin">Lin</option>
            </select>
            <small>{t.local}</small>
          </section>
        );
      case "storage":
        return (
          <section key={key} className="forge-runtime-card">
            <h4>{label}</h4>
            <p data-testid="forge-order-count">
              {t.orders}: {orders.length}
            </p>
            <p data-testid="forge-last-order-user">
              {forgeText(lang, "runtime.lastUser")}: {orders.at(-1)?.user ?? "—"}
            </p>
          </section>
        );
      case "chart":
        return (
          <section key={key} className="forge-runtime-card">
            <h4>{customLabel ?? label}</h4>
            <div className="forge-runtime-bars" aria-label={t.orders}>
              {orders.length === 0 ? (
                <span className="forge-runtime-bar" style={{ height: 4 }} />
              ) : (
                orders.map((order, index) => (
                  <span
                    key={`${order.at}-${index}`}
                    className="forge-runtime-bar"
                    style={{ height: `${12 + index * 6}px` }}
                  />
                ))
              )}
            </div>
          </section>
        );
      case "dialog":
        return (
          <details key={key} className="forge-runtime-card">
            <summary>{label}</summary>
            <p>{entry?.description[lang] ?? node.label}</p>
          </details>
        );
      case "table":
        return (
          <table key={key} className="forge-runtime-table">
            <caption>{customLabel ?? label}</caption>
            <tbody>
              {PRODUCTS.map((product) => (
                <tr key={product.id}>
                  <th scope="row">{product.name}</th>
                  <td>{product.price} CHF</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case "input": {
        const textKey = `input:${key}`;
        return (
          <label key={key} className="forge-runtime-card">
            {customLabel ?? label}
            <input
              value={texts[textKey] ?? ""}
              onChange={(event) => setTexts((prev) => ({ ...prev, [textKey]: event.target.value }))}
            />
            <small>{texts[textKey] || entry?.description[lang]}</small>
          </label>
        );
      }
      case "feedback":
        return (
          <p key={key} className="forge-runtime-note" role="status">
            {label}: {orders.length > 0 ? `${t.orders} ${orders.length}` : t.local}
          </p>
        );
      case "icon":
        return (
          <span key={key} className="forge-runtime-icon" title={label}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M12 2 3 7v10l9 5 9-5V7z" fill="currentColor" opacity="0.7" />
              <path d="M12 7 7 10v4l5 3 5-3v-4z" fill="currentColor" />
            </svg>
            {label}
          </span>
        );
      case "date":
        return (
          <p key={key} className="forge-runtime-note">
            {t.date}: {new Date().toLocaleDateString(lang === "de" ? "de-CH" : "en-GB")}
          </p>
        );
      default:
        return (
          <p key={key} className="forge-runtime-note">
            {label}
          </p>
        );
    }
  };

  if (entries.length === 0) {
    return (
      <div className="forge-runtime" data-testid="forge-preview">
        <p>{t.preview}</p>
        <p className="forge-runtime-empty">{t.needs}</p>
      </div>
    );
  }

  return (
    <div className="forge-runtime" data-testid="forge-preview" data-project-kind={project.kind}>
      <div className="forge-runtime-toolbar">
        <span className="forge-runtime-live">{t.preview}</span>
        <div
          className="forge-runtime-device"
          role="group"
          aria-label={forgeText(lang, "runtime.viewSize")}
        >
          <button
            type="button"
            aria-pressed={device === "desktop"}
            onClick={() => setDevice("desktop")}
          >
            {t.desktop}
          </button>
          <button
            type="button"
            aria-pressed={device === "mobile"}
            onClick={() => setDevice("mobile")}
          >
            {t.mobile}
          </button>
        </div>
      </div>
      {missing.length > 0 && (
        <ul className="forge-runtime-missing" role="alert" data-testid="forge-runtime-missing">
          {missing.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      <div className="forge-runtime-browser" data-device={device}>
        <div className="forge-runtime-browser-bar">
          <span className="forge-runtime-browser-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="forge-runtime-browser-url">local · {project.name}</span>
          <span>{device === "desktop" ? "1280" : "390"}</span>
        </div>
        <div
          className={`forge-runtime-app ${project.kind === "website" ? "is-website" : "is-app"}`}
        >
          {entries.map(render)}
        </div>
      </div>
      <div className="forge-runtime-checks" aria-label={forgeText(lang, "runtime.projectCheck")}>
        {checks.map((check) => (
          <span
            key={check.id}
            className="forge-runtime-check"
            data-pass={check.pass}
            data-check={check.id}
          >
            <span aria-hidden="true">{check.pass ? "✓" : "○"}</span>
            {check.label}
          </span>
        ))}
      </div>
    </div>
  );
}
