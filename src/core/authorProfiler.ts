import { reddit } from '@devvit/web/server';
import {
  type AuthorProfile,
  type TrustTier,
  getAuthorProfile,
  getUserActionCounts,
  setAuthorProfile,
} from './redis.js';

export function computeTrustTier(profile: Omit<AuthorProfile, 'tier'>): TrustTier {
  const { accountAgeDays, commentKarma, priorRemovals } = profile;

  if (accountAgeDays < 7 || priorRemovals >= 5) return 'high-risk';
  if (accountAgeDays < 30 || priorRemovals >= 2 || commentKarma < 10) return 'watch';
  if (accountAgeDays > 365 && commentKarma > 1000 && priorRemovals === 0) return 'trusted';
  return 'neutral';
}

export async function buildAuthorProfile(
  username: string
): Promise<AuthorProfile> {
  const [user, actions] = await Promise.all([
    reddit.getUserByUsername(username),
    getUserActionCounts(username),
  ]);

  const now = Date.now();
  const accountAgeDays = user
    ? Math.floor((now - user.createdAt.getTime()) / 86_400_000)
    : 0;

  const base = {
    username,
    accountAgeDays,
    linkKarma: user?.linkKarma ?? 0,
    commentKarma: user?.commentKarma ?? 0,
    priorRemovals: actions.removals,
    priorApprovals: actions.approvals,
    computedAt: now,
  };

  return { ...base, tier: computeTrustTier(base) };
}

export async function getOrBuildAuthorProfile(username: string): Promise<AuthorProfile> {
  const cached = await getAuthorProfile(username);
  if (cached) return cached;

  const profile = await buildAuthorProfile(username);
  await setAuthorProfile(profile);
  return profile;
}
