import type { EpheRole } from "./epheRoles";

/**
 * The three resident roles, in one sentence each (Zielbild 2026-10-22 #24,
 * "View specialized residents").
 *
 * The rule this file exists to keep: a sentence about a resident is only worth
 * printing if the job behind it is readable in code. So every note names the
 * function that decides it, and `role-notes.test.ts` fails if that function is
 * gone or was never there. No biography, no invented citizen — the crowd has
 * three jobs, each one a claim about a file, and the panel says exactly that.
 */
export interface RoleNote {
  role: EpheRole;
  /** The name the resident card already uses for this role. */
  nameKey: "guide.badge" | "guide.securityBadge" | "guide.maintenanceBadge";
  /** The sentence. */
  noteKey: "roles.explorer" | "roles.security" | "roles.maintenance";
  /** The exported function in `city/epheRoles.ts` that decides the job. */
  quelle: "guideClaimFor" | "securityClaimFor" | "maintenanceClaimFor";
  /** What the role stands on: the surface the job is drawn on. */
  flaecheKey: "roles.explorerWhere" | "roles.securityWhere" | "roles.maintenanceWhere";
}

export const ROLE_NOTES: readonly RoleNote[] = [
  {
    role: "explorer",
    nameKey: "guide.badge",
    noteKey: "roles.explorer",
    quelle: "guideClaimFor",
    flaecheKey: "roles.explorerWhere",
  },
  {
    role: "security",
    nameKey: "guide.securityBadge",
    noteKey: "roles.security",
    quelle: "securityClaimFor",
    flaecheKey: "roles.securityWhere",
  },
  {
    role: "maintenance",
    nameKey: "guide.maintenanceBadge",
    noteKey: "roles.maintenance",
    quelle: "maintenanceClaimFor",
    flaecheKey: "roles.maintenanceWhere",
  },
] as const;
