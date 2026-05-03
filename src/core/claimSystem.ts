import { settings } from '@devvit/web/server';
import { type ClaimRecord, deleteClaim, getClaim, setClaim } from './redis.js';

export async function claimItem(
  itemId: string,
  modUsername: string
): Promise<{ success: boolean; message: string; claim?: ClaimRecord }> {
  const existing = await getClaim(itemId);
  const now = Date.now();

  if (existing && existing.expiresAt > now && existing.claimedBy !== modUsername) {
    const minAgo = Math.floor((now - existing.claimedAt) / 60_000);
    return {
      success: false,
      message: `Being reviewed by u/${existing.claimedBy} (${minAgo}m ago)`,
    };
  }

  const ttlMinutes = (await settings.get<number>('claimTtlMinutes')) ?? 30;
  const ttlMs = ttlMinutes * 60_000;

  const claim: ClaimRecord = {
    itemId,
    claimedBy: modUsername,
    claimedAt: now,
    expiresAt: now + ttlMs,
  };

  await setClaim(claim, ttlMs);
  return { success: true, message: `Claimed by u/${modUsername}`, claim };
}

export async function releaseClaim(itemId: string): Promise<void> {
  await deleteClaim(itemId);
}

export async function isClaimedByOther(
  itemId: string,
  requestingMod: string
): Promise<{ claimed: boolean; by?: string }> {
  const existing = await getClaim(itemId);
  if (!existing || existing.expiresAt <= Date.now()) return { claimed: false };
  if (existing.claimedBy === requestingMod) return { claimed: false };
  return { claimed: true, by: existing.claimedBy };
}
