import type { Request, Response } from "express";
import { listPacks } from "../../services/security/rule-packs.js";
import { isOffline } from "../../services/security/network-policy.js";

/**
 * GET /api/rule-packs — which rule bundles exist, where they came from, and
 * under what license. The UI cannot offer a pack it has not seen here, and a
 * pack whose manifest lies about its rule count is not in this list. The
 * absolute directory stays server-side: the client selects by id, never by path.
 */
export function handleRulePacks(_req: Request, res: Response): void {
  res.json({
    offline: isOffline(),
    packs: listPacks().map(({ dir: _dir, ...publicPack }) => publicPack),
  });
}
