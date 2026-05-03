import { redis } from '@devvit/web/server';

// ─── Domain Types ────────────────────────────────────────────────────────────

export type TrustTier = 'trusted' | 'neutral' | 'watch' | 'high-risk';

export type AuthorProfile = {
  username: string;
  accountAgeDays: number;
  linkKarma: number;
  commentKarma: number;
  priorRemovals: number;
  priorApprovals: number;
  tier: TrustTier;
  computedAt: number;
};

export type TextSignals = {
  hedgingDensity: number;
  sentenceUniformity: number;
  ttr: number;
  fleschKincaid: number;
  structuralPatterns: string[];
  wordCount: number;
  analysedAt: number;
};

export type RiskScore = {
  score: number;
  tier: 'low' | 'medium' | 'high' | 'critical';
  rationale: string;
  computedAt: number;
};

export type EnrichedItem = {
  itemId: string;
  itemType: 'post' | 'comment';
  authorUsername: string;
  title?: string;
  body?: string;
  authorProfile: AuthorProfile;
  textSignals: TextSignals;
  riskScore: RiskScore;
  enrichedAt: number;
  snoozeUntil?: number;
};

export type ClaimRecord = {
  itemId: string;
  claimedBy: string;
  claimedAt: number;
  expiresAt: number;
};

export type VoteRecord = {
  itemId: string;
  votes: Record<string, 'approve' | 'remove' | 'discuss'>;
  updatedAt: number;
};

export type FeedbackRecord = {
  itemId: string;
  predictedTier: string;
  actualAction: 'approve' | 'remove' | 'ignore';
  agreedWithPrediction: boolean;
  recordedAt: number;
};

export type DigestStats = {
  date: string;
  totalEnriched: number;
  highRiskCount: number;
  approvedCount: number;
  removedCount: number;
  avgScore: number;
  agreementRate: number;
};

// ─── Key Builders ────────────────────────────────────────────────────────────

export const keys = {
  item: (id: string) => `mp:item:${id}`,
  user: (username: string) => `mp:user:${username}`,
  claim: (id: string) => `mp:claim:${id}`,
  vote: (id: string) => `mp:vote:${id}`,
  feedback: (id: string) => `mp:feedback:${id}`,
  feedbackLog: 'mp:feedback:log',
  digest: (date: string) => `mp:digest:${date}`,
  highRiskQueue: 'mp:queue:high-risk',
  teamReviewQueue: 'mp:queue:team-review',
  dailyStat: (date: string, stat: string) => `mp:stats:daily:${date}:${stat}`,
  repeatOffenders: 'mp:repeat-offenders',
  baselineActive: 'mp:baseline:active',
  baselineSample: (id: string) => `mp:baseline:sample:${id}`,
  userActions: (username: string) => `mp:user-actions:${username}`,
  patternWave: (hourKey: string) => `mp:pattern:wave:${hourKey}`,
  hourlyStat: (hourKey: string, stat: string) => `mp:stats:hourly:${hourKey}:${stat}`,
  brigadeAlert: 'mp:alert:brigading',
};

// ─── TTLs (milliseconds for Date constructor) ────────────────────────────────

const MS = {
  item: 30 * 24 * 60 * 60 * 1000,
  user: 7 * 24 * 60 * 60 * 1000,
  vote: 7 * 24 * 60 * 60 * 1000,
  feedback: 90 * 24 * 60 * 60 * 1000,
  digest: 90 * 24 * 60 * 60 * 1000,
  wave: 24 * 60 * 60 * 1000,
  alert: 2 * 60 * 60 * 1000,
  hourlyStat: 48 * 60 * 60 * 1000,
};

function exp(ttlMs: number): { expiration: Date } {
  return { expiration: new Date(Date.now() + ttlMs) };
}

// ─── Item ────────────────────────────────────────────────────────────────────

export async function getItem(itemId: string): Promise<EnrichedItem | undefined> {
  const raw = await redis.get(keys.item(itemId));
  return raw ? (JSON.parse(raw) as EnrichedItem) : undefined;
}

export async function setItem(item: EnrichedItem): Promise<void> {
  await redis.set(keys.item(item.itemId), JSON.stringify(item), exp(MS.item));
}

// ─── Author Profile ──────────────────────────────────────────────────────────

export async function getAuthorProfile(username: string): Promise<AuthorProfile | undefined> {
  const raw = await redis.get(keys.user(username));
  return raw ? (JSON.parse(raw) as AuthorProfile) : undefined;
}

export async function setAuthorProfile(profile: AuthorProfile): Promise<void> {
  await redis.set(keys.user(profile.username), JSON.stringify(profile), exp(MS.user));
}

// ─── User Actions (prior removals/approvals) ─────────────────────────────────

export async function getUserActionCounts(
  username: string
): Promise<{ removals: number; approvals: number }> {
  const [removals, approvals] = await Promise.all([
    redis.hGet(keys.userActions(username), 'removals'),
    redis.hGet(keys.userActions(username), 'approvals'),
  ]);
  return {
    removals: removals ? parseInt(removals, 10) : 0,
    approvals: approvals ? parseInt(approvals, 10) : 0,
  };
}

export async function incrementUserAction(
  username: string,
  action: 'removals' | 'approvals'
): Promise<void> {
  await redis.hIncrBy(keys.userActions(username), action, 1);
}

// ─── Claim ───────────────────────────────────────────────────────────────────

export async function getClaim(itemId: string): Promise<ClaimRecord | undefined> {
  const raw = await redis.get(keys.claim(itemId));
  return raw ? (JSON.parse(raw) as ClaimRecord) : undefined;
}

export async function setClaim(claim: ClaimRecord, ttlMs: number): Promise<void> {
  await redis.set(keys.claim(claim.itemId), JSON.stringify(claim), exp(ttlMs));
}

export async function deleteClaim(itemId: string): Promise<void> {
  await redis.del(keys.claim(itemId));
}

// ─── Votes ───────────────────────────────────────────────────────────────────

export async function getVotes(itemId: string): Promise<VoteRecord | undefined> {
  const raw = await redis.get(keys.vote(itemId));
  return raw ? (JSON.parse(raw) as VoteRecord) : undefined;
}

export async function setVotes(votes: VoteRecord): Promise<void> {
  await redis.set(keys.vote(votes.itemId), JSON.stringify(votes), exp(MS.vote));
}

// ─── Feedback ────────────────────────────────────────────────────────────────

export async function getFeedback(itemId: string): Promise<FeedbackRecord | undefined> {
  const raw = await redis.get(keys.feedback(itemId));
  return raw ? (JSON.parse(raw) as FeedbackRecord) : undefined;
}

export async function setFeedback(fb: FeedbackRecord): Promise<void> {
  await redis.set(keys.feedback(fb.itemId), JSON.stringify(fb), exp(MS.feedback));
  await redis.zAdd(keys.feedbackLog, { score: fb.recordedAt, member: fb.itemId });
}

export async function getRecentFeedbackIds(limit: number): Promise<string[]> {
  const entries = await redis.zRange(keys.feedbackLog, 0, limit - 1, {
    by: 'rank',
    reverse: true,
  });
  return entries.map((e) => e.member);
}

// ─── Digest ──────────────────────────────────────────────────────────────────

export async function getDigest(date: string): Promise<DigestStats | undefined> {
  const raw = await redis.get(keys.digest(date));
  return raw ? (JSON.parse(raw) as DigestStats) : undefined;
}

export async function setDigest(stats: DigestStats): Promise<void> {
  await redis.set(keys.digest(stats.date), JSON.stringify(stats), exp(MS.digest));
}

// ─── High-Risk Queue ─────────────────────────────────────────────────────────

export async function addToHighRiskQueue(itemId: string, score: number): Promise<void> {
  await redis.zAdd(keys.highRiskQueue, { score, member: itemId });
}

export async function removeFromHighRiskQueue(itemId: string): Promise<void> {
  await redis.zRem(keys.highRiskQueue, [itemId]);
}

export async function getHighRiskQueue(limit = 50): Promise<{ member: string; score: number }[]> {
  return redis.zRange(keys.highRiskQueue, 0, limit - 1, { by: 'rank', reverse: true });
}

export async function getHighRiskQueueSize(): Promise<number> {
  return redis.zCard(keys.highRiskQueue);
}

// ─── Team Review Queue ───────────────────────────────────────────────────────

export async function addToTeamReviewQueue(itemId: string, score: number): Promise<void> {
  await redis.zAdd(keys.teamReviewQueue, { score, member: itemId });
}

export async function removeFromTeamReviewQueue(itemId: string): Promise<void> {
  await redis.zRem(keys.teamReviewQueue, [itemId]);
}

export async function getTeamReviewQueue(
  limit = 5
): Promise<{ member: string; score: number }[]> {
  return redis.zRange(keys.teamReviewQueue, 0, limit - 1, { by: 'rank', reverse: true });
}

// ─── Daily Stats ─────────────────────────────────────────────────────────────

export async function incrementDailyStat(
  date: string,
  stat: 'removals' | 'approvals' | 'enriched'
): Promise<void> {
  await redis.incrBy(keys.dailyStat(date, stat), 1);
}

export async function getDailyStat(
  date: string,
  stat: 'removals' | 'approvals' | 'enriched'
): Promise<number> {
  const val = await redis.get(keys.dailyStat(date, stat));
  return val ? parseInt(val, 10) : 0;
}

// ─── Hourly Stats ────────────────────────────────────────────────────────────

export async function setHourlyStat(hourKey: string, stat: string, value: number): Promise<void> {
  await redis.set(keys.hourlyStat(hourKey, stat), String(value), exp(MS.hourlyStat));
}

export async function getHourlyStat(hourKey: string, stat: string): Promise<number> {
  const val = await redis.get(keys.hourlyStat(hourKey, stat));
  return val ? parseInt(val, 10) : 0;
}

// ─── Repeat Offenders ────────────────────────────────────────────────────────

export async function incrementRepeatOffender(username: string): Promise<void> {
  await redis.zIncrBy(keys.repeatOffenders, username, 1);
}

export async function getTopRepeatOffenders(
  limit = 10
): Promise<{ member: string; score: number }[]> {
  return redis.zRange(keys.repeatOffenders, 0, limit - 1, { by: 'rank', reverse: true });
}

// ─── Baseline ────────────────────────────────────────────────────────────────

export async function isBaselineActive(): Promise<boolean> {
  const val = await redis.get(keys.baselineActive);
  return val === '1';
}

export async function setBaselineActive(durationDays: number): Promise<void> {
  await redis.set(keys.baselineActive, '1', {
    expiration: new Date(Date.now() + durationDays * 86_400_000),
  });
}

export async function clearBaselineActive(): Promise<void> {
  await redis.del(keys.baselineActive);
}

export async function setBaselineSample(item: EnrichedItem): Promise<void> {
  await redis.set(keys.baselineSample(item.itemId), JSON.stringify(item), exp(MS.item));
}

// ─── Pattern Wave ────────────────────────────────────────────────────────────

export function currentHourKey(): string {
  return String(Math.floor(Date.now() / 3_600_000));
}

export async function recordPatternWave(username: string): Promise<void> {
  const hourKey = currentHourKey();
  await redis.zIncrBy(keys.patternWave(hourKey), username, 1);
  await redis.expire(keys.patternWave(hourKey), 86_400);
}

export async function getPatternWaveTop(
  limit = 10
): Promise<{ member: string; score: number }[]> {
  return redis.zRange(keys.patternWave(currentHourKey()), 0, limit - 1, {
    by: 'rank',
    reverse: true,
  });
}

// ─── Brigade Alert ───────────────────────────────────────────────────────────

export async function setBrigadeAlert(): Promise<void> {
  await redis.set(keys.brigadeAlert, '1', exp(MS.alert));
}

export async function isBrigadeAlertActive(): Promise<boolean> {
  const val = await redis.get(keys.brigadeAlert);
  return val === '1';
}
