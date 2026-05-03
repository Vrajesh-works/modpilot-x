import type { AuthorProfile, RiskScore, TextSignals } from './redis.js';

export type ScoreWeights = {
  authorTier: number;
  hedging: number;
  uniformity: number;
  ttr: number;
  structural: number;
  fk: number;
};

export const DEFAULT_WEIGHTS: ScoreWeights = {
  authorTier: 3.0,
  hedging: 1.5,
  uniformity: 1.5,
  ttr: 1.0,
  structural: 1.0,
  fk: 0.5,
};

const TIER_BASE: Record<AuthorProfile['tier'], number> = {
  trusted: 0,
  neutral: 1,
  watch: 3,
  'high-risk': 5,
};

export function scoreTier(score: number): RiskScore['tier'] {
  if (score <= 3) return 'low';
  if (score <= 6) return 'medium';
  if (score <= 8) return 'high';
  return 'critical';
}

export function computeRiskScore(
  profile: AuthorProfile,
  signals: TextSignals,
  weights: Partial<ScoreWeights> = {}
): RiskScore {
  const w = { ...DEFAULT_WEIGHTS, ...weights };

  // Author tier contribution (0–5 mapped to 0–w.authorTier)
  const tierScore = (TIER_BASE[profile.tier] / 5) * w.authorTier;

  // Hedging density (0–1 → 0–w.hedging)
  const hedgingScore = signals.hedgingDensity * w.hedging;

  // Sentence uniformity (0–1, high = suspicious → 0–w.uniformity)
  const uniformityScore = signals.sentenceUniformity * w.uniformity;

  // TTR: low is suspicious — invert, only meaningful on longer texts
  const ttrScore =
    signals.wordCount >= 50 ? Math.max(0, 1 - signals.ttr) * w.ttr : 0;

  // Structural patterns: 0.5 per pattern, max 2.0
  const structuralScore =
    Math.min(2, signals.structuralPatterns.length * 0.5) * (w.structural / 2);

  // FK outlier: grade 8–14 is suspiciously "normal" for AI
  const fkScore =
    signals.wordCount >= 30 && signals.fleschKincaid >= 8 && signals.fleschKincaid <= 14
      ? w.fk
      : 0;

  const raw = tierScore + hedgingScore + uniformityScore + ttrScore + structuralScore + fkScore;
  const maxPossible = w.authorTier + w.hedging + w.uniformity + w.ttr + w.structural + w.fk;
  const normalized = Math.round((raw / maxPossible) * 9) + 1;
  const score = Math.max(1, Math.min(10, normalized));

  return {
    score,
    tier: scoreTier(score),
    rationale: buildRationale(score, profile, signals),
    computedAt: Date.now(),
  };
}

export function buildRationale(
  score: number,
  profile: AuthorProfile,
  signals: TextSignals
): string {
  const parts: string[] = [`Score: ${score}/10 (${scoreTier(score).toUpperCase()})`];

  if (profile.tier === 'high-risk' || profile.tier === 'watch') {
    parts.push(`Author tier: ${profile.tier.toUpperCase()}`);
  }
  if (profile.accountAgeDays < 7) {
    parts.push(`Account only ${profile.accountAgeDays}d old`);
  }
  if (profile.priorRemovals > 0) {
    parts.push(`${profile.priorRemovals} prior removal(s)`);
  }
  if (signals.hedgingDensity > 0.08) {
    parts.push(`High hedging density (${(signals.hedgingDensity * 100).toFixed(0)}%)`);
  }
  if (signals.sentenceUniformity > 0.7) {
    parts.push('Very uniform sentence lengths');
  }
  if (signals.ttr < 0.45 && signals.wordCount >= 50) {
    parts.push(`Low vocabulary diversity (TTR ${signals.ttr.toFixed(2)})`);
  }
  if (signals.structuralPatterns.length > 0) {
    parts.push(`Patterns: ${signals.structuralPatterns.join(', ')}`);
  }
  if (signals.fleschKincaid > 14) {
    parts.push('Very high readability grade');
  }

  return parts.join(' · ');
}
