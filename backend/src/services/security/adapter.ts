import type { SecurityIssue } from '../../models/index.js';

export interface ScannerAdapter {
  readonly id: string;
  scanFile(filePath: string, content: string): Promise<SecurityIssue[]> | SecurityIssue[];
  scanBatch?(clonePath: string, contentByPath?: Map<string, string>): Promise<SecurityIssue[]>;
  scanSingleContent?(filePath: string, content: string): Promise<SecurityIssue[]>;
}

export type AdapterResult = {
  issues: SecurityIssue[];
  provenance: string;
};
