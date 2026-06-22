import { describe, expect, it } from 'vitest';
import { boursobankEtfUrl } from './boursobank';

describe('boursobankEtfUrl', () => {
  it('builds a Boursobank tracker URL from the stored identifier', () => {
    expect(boursobankEtfUrl({ boursoIdentifier: '1rTPUST' })).toBe(
      'https://bourse.boursobank.com/bourse/trackers/cours/1rTPUST/',
    );
  });

  it('returns null without a Boursobank identifier', () => {
    expect(boursobankEtfUrl({ boursoIdentifier: null })).toBeNull();
  });
});
