/**
 * GitHubClient — Fetches repository metadata and file listings from GitHub API.
 *
 * Responsibilities:
 * - Clone repositories via SSH/HTTPS
 * - Fetch file tree and metadata (LoC, languages, contributors)
 * - Validate repo accessibility and branch existence
 */

import type pino from 'pino';
import type { GitHubRepo } from '../../models/index.js';

export interface GitHubRepoMetadata {
  owner: string;
  name: string;
  defaultBranch: string;
  description: string;
  language: string;
  languages: Record<string, number>;
  starCount: number;
  forkCount: number;
  createdAt: string;
  updatedAt: string;
  size: number; // KB
  visibility: string;
  hasIssues: boolean;
  hasWiki: boolean;
  hasPages: boolean;
  topics: string[];
  license: string | null;
}

export class GitHubClient {
  private logger: pino.Logger;
  private token: string | undefined;

  constructor(logger: pino.Logger) {
    this.logger = logger.child({ service: 'github-client' });
    this.token = process.env.GITHUB_TOKEN;
  }

  /** Validate a GitHub URL and extract owner/repo/branch */
  parseGitHubUrl(url: string): { owner: string; repo: string; branch?: string } {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+))?/);
    if (!match) {
      throw new Error(`Invalid GitHub URL: ${url}`);
    }
    return {
      owner: match[1]!,
      repo: match[2]!,
      branch: match[3] || 'main',
    };
  }

  /** Get metadata for a public repository via GitHub API */
  async getRepoMetadata(repo: GitHubRepo): Promise<GitHubRepoMetadata> {
    const apiUrl = `https://api.github.com/repos/${repo.owner}/${repo.name}`;
    this.logger.info({ apiUrl }, 'Fetching repo metadata');

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
      };
      if (this.token) {
        headers['Authorization'] = `token ${this.token}`;
      }

      const response = await fetch(apiUrl, { headers });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Repository not found: ${repo.owner}/${repo.name}`);
        }
        if (response.status === 403) {
          throw new Error('GitHub API rate limit exceeded. Set GITHUB_TOKEN in .env');
        }
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      return {
        owner: repo.owner,
        name: repo.name,
        defaultBranch: data.default_branch || repo.branch,
        description: data.description || '',
        language: data.language || 'Unknown',
        languages: data.languages || {},
        starCount: data.stargazers_count || 0,
        forkCount: data.forks_count || 0,
        createdAt: data.created_at || '',
        updatedAt: data.updated_at || '',
        size: data.size || 0,
        visibility: data.visibility || 'public',
        hasIssues: data.has_issues || false,
        hasWiki: data.has_wiki || false,
        hasPages: data.has_pages || false,
        topics: data.topics || [],
        license: data.license?.spdx_id || '',
      };
    } catch (error) {
      this.logger.error({ error, repo }, 'Failed to fetch repo metadata');
      throw error;
    }
  }

  /** List all files in a repository (non-recursive, root level) */
  async listRootFiles(repo: GitHubRepo): Promise<string[]> {
    const apiUrl = `https://api.github.com/repos/${repo.owner}/${repo.name}/git/trees/${repo.branch}?recursive=1`;
    this.logger.info({ apiUrl }, 'Fetching file tree');

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
      };
      if (this.token) {
        headers['Authorization'] = `token ${this.token}`;
      }

      const response = await fetch(apiUrl, { headers });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = await response.json();
      const tree = data.tree as Array<{ path: string; type: string }>;

      // Filter only files (not directories)
      return tree.filter(item => item.type === 'blob').map(item => item.path);
    } catch (error) {
      this.logger.error({ error, repo }, 'Failed to list files');
      throw error;
    }
  }

  /** Get file content from GitHub API (for remote analysis without cloning) */
  async getFileContent(repo: GitHubRepo, filePath: string): Promise<string> {
    const apiUrl = `https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${filePath}?ref=${repo.branch}`;

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
      };
      if (this.token) {
        headers['Authorization'] = `token ${this.token}`;
      }

      const response = await fetch(apiUrl, { headers });

      if (!response.ok) {
        throw new Error(`File not found: ${filePath} (HTTP ${response.status})`);
      }

      const data = await response.json();
      // GitHub API returns base64-encoded content
      return Buffer.from(data.content, 'base64').toString('utf-8');
    } catch (error) {
      this.logger.warn({ error, filePath }, 'Failed to fetch file content via API, will try clone');
      throw error;
    }
  }
}
