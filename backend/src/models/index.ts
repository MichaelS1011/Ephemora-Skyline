/**
 * Domain Models — TypeScript interfaces for all entities.
 *
 * These interfaces define the shape of data flowing
 * between backend services and the frontend.
 */

export interface GitHubRepo {
  owner: string;
  name: string;
  branch: string;
  cloneUrl: string;
  analyzedAt: string;
}

export interface FileAnalysis {
  path: string;
  language: string;
  lines: { total: number; code: number; comments: number; blank: number };
  complexity: { cyclomatic: number; cognitive: number };
  functions: Array<{
    name: string;
    line: number;
    parameters: number;
    complexity: number;
    isAsync: boolean;
  }>;
  classes: Array<{ name: string; line: number; methods: number }>;
  imports: Array<{
    source: string;
    named: string[];
    isExternal: boolean;
    line: number;
  }>;
  exports: Array<{
    type: 'named' | 'default' | 'reexport';
    name: string;
    line: number;
  }>;
  content?: string;
  vulnerabilities: SecurityIssue[];
}

export interface SecurityIssue {
  type: string;
  severity: 'P0' | 'P1' | 'P2';
  score: number;
  line: number;
  code: string;
  message: string;
  fix?: string;
  provenance?: string;
  ruleId?: string;
}

export interface AnalysisResult {
  id: string;
  repo: GitHubRepo;
  files: FileAnalysis[];
  directories: DirectorySummary[];
  summary: ProjectSummary;
  createdAt: string;
  status: 'pending' | 'analyzing' | 'complete' | 'failed';
  error?: string;
}

export interface DirectorySummary {
  path: string;
  fileCount: number;
  totalLines: number;
  avgComplexity: number;
  vulnerabilityCount: number;
  children: DirectorySummary[];
}

export interface ProjectSummary {
  totalFiles: number;
  totalDirectories: number;
  totalLines: number;
  avgCyclomatic: number;
  maxCyclomatic: number;
  languages: Record<string, number>;
  totalVulnerabilities: number;
  vulnerabilitiesBySeverity: { P0: number; P1: number; P2: number };
  languagesByLines: Record<string, number>;
  /** Which scanners actually contributed to this result ("complete" can be regex-only) */
  scanProvenance?: { regex: boolean; gitleaks: boolean; semgrep: boolean };
}

export type WebSocketEventType =
  | 'repo_cloned'
  | 'file_parsing_started'
  | 'file_parsed'
  | 'building_generated'
  | 'analysis_progress'
  | 'analysis_complete'
  | 'vulnerability_found'
  | 'connected'
  | 'error';

export interface WebSocketEvent {
  type: WebSocketEventType;
  payload: Record<string, unknown>;
  timestamp: string;
}
