import { reddit } from '@devvit/web/server';
import type { T1, T3 } from '@devvit/shared-types/tid.js';
import {
  addToTeamReviewQueue,
  getItem,
  incrementDailyStat,
  removeFromHighRiskQueue,
  setItem,
} from './redis.js';
import { releaseClaim } from './claimSystem.js';

export type QuickActionType = 'approve' | 'remove' | 'snooze' | 'flag-for-team';

export async function handleQuickAction(
  action: QuickActionType,
  itemId: string,
  _modUsername: string,
  _note?: string
): Promise<{ success: boolean; message: string }> {
  const today = new Date().toISOString().slice(0, 10);

  try {
    if (action === 'approve') {
      if (itemId.startsWith('t1_')) {
        await reddit.approve(itemId as T1);
      } else {
        await reddit.approve(itemId as T3);
      }
      await Promise.all([
        removeFromHighRiskQueue(itemId),
        incrementDailyStat(today, 'approvals'),
        releaseClaim(itemId),
      ]);
      return { success: true, message: `Approved ${itemId}` };
    }

    if (action === 'remove') {
      if (itemId.startsWith('t1_')) {
        await reddit.remove(itemId as T1, false);
      } else {
        await reddit.remove(itemId as T3, false);
      }
      await Promise.all([
        removeFromHighRiskQueue(itemId),
        incrementDailyStat(today, 'removals'),
        releaseClaim(itemId),
      ]);
      return { success: true, message: `Removed ${itemId}` };
    }

    if (action === 'snooze') {
      const item = await getItem(itemId);
      if (item) {
        const snoozed = { ...item, snoozeUntil: Date.now() + 24 * 60 * 60 * 1000 };
        await setItem(snoozed);
      }
      await Promise.all([removeFromHighRiskQueue(itemId), releaseClaim(itemId)]);
      return { success: true, message: `Snoozed ${itemId} for 24h` };
    }

    if (action === 'flag-for-team') {
      const item = await getItem(itemId);
      const score = item?.riskScore.score ?? 5;
      await addToTeamReviewQueue(itemId, score);
      return { success: true, message: `Flagged for team review` };
    }

    return { success: false, message: `Unknown action: ${action}` };
  } catch (err) {
    console.error(`[ModPilot] quickAction ${action} failed for ${itemId}:`, err);
    return { success: false, message: `Action failed. Please try again.` };
  }
}
