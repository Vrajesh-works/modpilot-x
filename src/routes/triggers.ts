import { Hono } from 'hono';
import type {
  OnAppInstallRequest,
  OnModActionRequest,
  OnPostReportRequest,
  OnPostSubmitRequest,
  TriggerResponse,
} from '@devvit/web/shared';
import { settings } from '@devvit/web/server';
import { enrichAndStore } from '../core/enrichment.js';
import {
  getItem,
  incrementDailyStat,
  incrementRepeatOffender,
  incrementUserAction,
  recordPatternWave,
  setBaselineActive,
} from '../core/redis.js';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  const input = await c.req.json<OnAppInstallRequest>();
  console.log('App installed to subreddit: r/' + input.subreddit?.name);

  try {
    const baselineDays = (await settings.get<number>('baselineDays')) ?? 0;
    if (baselineDays > 0) {
      await setBaselineActive(baselineDays);
      console.log(`[ModPilot] Baseline mode active for ${baselineDays} day(s)`);
    }
  } catch (err) {
    console.error('[ModPilot] App install setup failed:', err);
  }

  return c.json<TriggerResponse>({ status: 'success' }, 200);
});

triggers.post('/on-post-submit', async (c) => {
  const input = await c.req.json<OnPostSubmitRequest>();
  const post = input.post;
  const author = input.author;
  const sub = input.subreddit;

  if (!post || !author || !sub) {
    return c.json<TriggerResponse>({}, 200);
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    await Promise.all([
      enrichAndStore(
        `t3_${post.id}`,
        'post',
        author.name,
        post.selftext || post.title,
        sub.name,
        post.title
      ),
      incrementDailyStat(today, 'enriched'),
      recordPatternWave(author.name),
    ]);
  } catch (err) {
    console.error('[ModPilot] PostSubmit enrichment failed:', err);
  }

  return c.json<TriggerResponse>({}, 200);
});

triggers.post('/on-post-report', async (c) => {
  const input = await c.req.json<OnPostReportRequest>();
  const post = input.post;
  const sub = input.subreddit;

  if (!post || !sub) {
    return c.json<TriggerResponse>({}, 200);
  }

  const itemId = `t3_${post.id}`;

  try {
    const existing = await getItem(itemId);
    if (existing) {
      const bumped = Math.min(10, existing.riskScore.score + 1);
      await enrichAndStore(
        itemId,
        'post',
        existing.authorUsername,
        post.selftext || post.title,
        sub.name,
        post.title
      );
      console.log(`[ModPilot] Re-enriched reported item ${itemId}, score bumped to ${bumped}`);
    } else {
      // Item not yet enriched — enrich now
      // We don't have author from PostReport, so use authorId as placeholder
      await enrichAndStore(itemId, 'post', post.authorId, post.selftext || post.title, sub.name, post.title);
    }
  } catch (err) {
    console.error('[ModPilot] PostReport enrichment failed:', err);
  }

  return c.json<TriggerResponse>({}, 200);
});

triggers.post('/on-mod-action', async (c) => {
  const input = await c.req.json<OnModActionRequest>();
  const action = input.action ?? '';
  const targetUser = input.targetUser;
  const targetPost = input.targetPost;
  const today = new Date().toISOString().slice(0, 10);

  try {
    const isRemove = action.startsWith('remove');
    const isApprove = action.startsWith('approve');

    if (targetUser && (isRemove || isApprove)) {
      await incrementUserAction(targetUser.name, isRemove ? 'removals' : 'approvals');
      if (isRemove) {
        await incrementRepeatOffender(targetUser.name);
      }
    }

    if (isRemove) {
      await incrementDailyStat(today, 'removals');
    } else if (isApprove) {
      await incrementDailyStat(today, 'approvals');
    }

    // Record feedback if we have enriched data for the targeted post
    if (targetPost) {
      const itemId = `t3_${targetPost.id}`;
      const item = await getItem(itemId);
      if (item && targetUser) {
        const { recordFeedback } = await import('../core/feedbackLoop.js');
        await recordFeedback(
          itemId,
          item.riskScore.tier,
          isRemove ? 'remove' : isApprove ? 'approve' : 'ignore'
        );
      }
    }
  } catch (err) {
    console.error('[ModPilot] ModAction tracking failed:', err);
  }

  return c.json<TriggerResponse>({}, 200);
});
