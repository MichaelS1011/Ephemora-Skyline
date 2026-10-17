import type { Request, Response } from "express";
import { footprintSnapshot, purgeStaleCopies } from "./local-analyze.js";

/** GET /api/footprint — what this program keeps on the machine it runs on. */
export async function handleFootprint(_req: Request, res: Response): Promise<void> {
  res.json(await footprintSnapshot());
}

/** POST /api/footprint/purge — sweep the staged copies that are past their TTL. */
export async function handleFootprintPurge(_req: Request, res: Response): Promise<void> {
  res.json(await purgeStaleCopies());
}
