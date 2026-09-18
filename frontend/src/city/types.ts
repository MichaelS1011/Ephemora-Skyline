/**
 * City domain types — mirror of backend `cityMapper.ts` output.
 */

export type Severity = 'P0' | 'P1' | 'P2';
export type ThreatLevel = 'critical' | 'high' | 'medium' | 'low' | 'safe';

export interface CityFinding {
  type: string;
  severity: Severity;
  line: number;
  message: string;
  fix?: string;
  provenance?: string;
  ruleId?: string;
}

export interface CityFile {
  id: string;
  name: string;
  path: string;
  language: string;
  linesOfCode: number;
  cyclomaticComplexity: number;
  threatLevel: ThreatLevel;
  findings: CityFinding[];
}

export interface CityDir {
  name: string;
  path: string;
  fileCount: number;
  linesOfCode: number;
  languages: Record<string, number>;
  findingsBySeverity: Record<Severity, number>;
  threatScore: number;
  topFindings: CityFinding[];
  children: CityDir[];
  detailFiles: CityFile[];
  remainingFiles: number;
  /** Up to 6 representative subtree files — the district's skyline. */
  districtFiles: CityFile[];
}

export interface FileConnection {
  from: string;
  to: string;
  weight: number;
}

export interface DirConnection {
  from: string;
  to: string;
  weight: number;
}

export interface CityData {
  repo: { owner: string; name: string; branch: string };
  totalFiles: number;
  renderedFiles: number;
  totalLines: number;
  findingsBySeverity: Record<Severity, number>;
  languages: Record<string, number>;
  tree: CityDir;
  fileConnections: FileConnection[];
  dirConnections: DirConnection[];
}

/** Which unit is currently selected (a rendered file building or a block). */
export type SelectedUnit =
  | { kind: 'file'; id: string }
  | { kind: 'block'; path: string }
  | null;
