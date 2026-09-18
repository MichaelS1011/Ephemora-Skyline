import { describe, it, expect } from 'vitest';
import { THREAT_COLOR, LANGUAGE_COLORS } from '../src/city/palette';
import { getDirLayout } from '../src/city/layout';
import type { CityData } from '../src/city/types';

describe('frontend smoke', () => {
  it('palette has threat levels', () => {
    expect(THREAT_COLOR).toBeDefined();
    expect(Object.keys(THREAT_COLOR).length).toBe(5);
    expect(LANGUAGE_COLORS.TypeScript).toBe('#5b9bff');
  });

  it('layout returns empty for null focus', () => {
    const fakeCity = {
      tree: {
        name: '',
        path: '',
        fileCount: 0,
        linesOfCode: 0,
        languages: {},
        findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
        threatScore: 0,
        topFindings: [],
        children: [],
        detailFiles: [],
        remainingFiles: 0,
        districtFiles: [],
      },
      totalFiles: 0,
      renderedFiles: 0,
      totalLines: 0,
      findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
      languages: {},
      fileConnections: [],
      dirConnections: [],
      repo: { owner: 'o', name: 'n', branch: 'main' },
    } as unknown as CityData;
    const layout = getDirLayout(fakeCity, []);
    expect(layout).toBeDefined();
    expect(layout.buildings).toEqual([]);
  });
});
