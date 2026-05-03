import { describe, it, expect } from 'vitest';
import { buildRationale, computeRiskScore, DEFAULT_WEIGHTS, scoreTier } from './riskScorer.js';
import type { AuthorProfile, TextSignals } from './redis.js';

function makeProfile(overrides: Partial<AuthorProfile> = {}): AuthorProfile {
  return {
    username: 'testuser',
    accountAgeDays: 365,
    linkKarma: 500,
    commentKarma: 2000,
    priorRemovals: 0,
    priorApprovals: 0,
    tier: 'trusted',
    computedAt: Date.now(),
    ...overrides,
  };
}

function makeSignals(overrides: Partial<TextSignals> = {}): TextSignals {
  return {
    hedgingDensity: 0,
    sentenceUniformity: 0,
    ttr: 0.8,
    fleschKincaid: 5,
    structuralPatterns: [],
    wordCount: 100,
    analysedAt: Date.now(),
    ...overrides,
  };
}

describe('scoreTier', () => {
  it('low for 1-3', () => {
    expect(scoreTier(1)).toBe('low');
    expect(scoreTier(3)).toBe('low');
  });

  it('medium for 4-6', () => {
    expect(scoreTier(4)).toBe('medium');
    expect(scoreTier(6)).toBe('medium');
  });

  it('high for 7-8', () => {
    expect(scoreTier(7)).toBe('high');
    expect(scoreTier(8)).toBe('high');
  });

  it('critical for 9-10', () => {
    expect(scoreTier(9)).toBe('critical');
    expect(scoreTier(10)).toBe('critical');
  });
});

describe('computeRiskScore', () => {
  it('trusted author with clean signals scores low', () => {
    const result = computeRiskScore(makeProfile({ tier: 'trusted' }), makeSignals());
    expect(result.score).toBeLessThanOrEqual(4);
    expect(result.tier).toMatch(/low|medium/);
  });

  it('high-risk author bumps score up', () => {
    const trusted = computeRiskScore(makeProfile({ tier: 'trusted' }), makeSignals());
    const highRisk = computeRiskScore(makeProfile({ tier: 'high-risk' }), makeSignals());
    expect(highRisk.score).toBeGreaterThan(trusted.score);
  });

  it('score is always between 1 and 10', () => {
    const result = computeRiskScore(
      makeProfile({ tier: 'high-risk', priorRemovals: 10, accountAgeDays: 1 }),
      makeSignals({ hedgingDensity: 1, sentenceUniformity: 1, ttr: 0.1, structuralPatterns: ['bulleted_list', 'numbered_list', 'url_heavy', 'excessive_ellipsis'] })
    );
    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeLessThanOrEqual(10);
  });

  it('tier on result matches scoreTier(score)', () => {
    const result = computeRiskScore(makeProfile(), makeSignals());
    expect(result.tier).toBe(scoreTier(result.score));
  });

  it('custom weights override defaults', () => {
    const signals = makeSignals({ hedgingDensity: 0.5 });
    const defaultResult = computeRiskScore(makeProfile(), signals);
    const heavyHedge = computeRiskScore(makeProfile(), signals, { hedging: 5 });
    expect(heavyHedge.score).toBeGreaterThanOrEqual(defaultResult.score);
  });

  it('ttr penalty only applies for wordCount >= 50', () => {
    const shortText = makeSignals({ ttr: 0.1, wordCount: 20 });
    const longText = makeSignals({ ttr: 0.1, wordCount: 100 });
    expect(computeRiskScore(makeProfile(), longText).score).toBeGreaterThanOrEqual(
      computeRiskScore(makeProfile(), shortText).score
    );
  });

  it('fk penalty applies when grade is 8-14 on 30+ word texts', () => {
    const withFk = makeSignals({ fleschKincaid: 10, wordCount: 50 });
    const withoutFk = makeSignals({ fleschKincaid: 16, wordCount: 50 });
    expect(computeRiskScore(makeProfile(), withFk).score).toBeGreaterThanOrEqual(
      computeRiskScore(makeProfile(), withoutFk).score
    );
  });
});

describe('buildRationale', () => {
  it('always starts with score and tier', () => {
    const rationale = buildRationale(7, makeProfile(), makeSignals());
    expect(rationale).toMatch(/^Score: 7\/10 \(HIGH\)/);
  });

  it('mentions prior removals when present', () => {
    const rationale = buildRationale(5, makeProfile({ priorRemovals: 3 }), makeSignals());
    expect(rationale).toContain('3 prior removal(s)');
  });

  it('mentions young account', () => {
    const rationale = buildRationale(4, makeProfile({ accountAgeDays: 3 }), makeSignals());
    expect(rationale).toContain('3d old');
  });

  it('mentions high hedging density', () => {
    const rationale = buildRationale(6, makeProfile(), makeSignals({ hedgingDensity: 0.2 }));
    expect(rationale).toContain('High hedging density');
  });

  it('mentions structural patterns', () => {
    const rationale = buildRationale(5, makeProfile(), makeSignals({ structuralPatterns: ['bulleted_list'] }));
    expect(rationale).toContain('bulleted_list');
  });

  it('does not mention clean signals', () => {
    const rationale = buildRationale(2, makeProfile({ tier: 'trusted' }), makeSignals());
    expect(rationale).not.toContain('prior removal');
    expect(rationale).not.toContain('hedging');
    expect(rationale).not.toContain('Patterns');
  });

  it('DEFAULT_WEIGHTS has all required keys', () => {
    expect(DEFAULT_WEIGHTS).toHaveProperty('authorTier');
    expect(DEFAULT_WEIGHTS).toHaveProperty('hedging');
    expect(DEFAULT_WEIGHTS).toHaveProperty('uniformity');
    expect(DEFAULT_WEIGHTS).toHaveProperty('ttr');
    expect(DEFAULT_WEIGHTS).toHaveProperty('structural');
    expect(DEFAULT_WEIGHTS).toHaveProperty('fk');
  });
});
