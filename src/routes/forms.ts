import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { isT1, isT3 } from '@devvit/shared-types/tid.js';
import { handleNuke, handleNukePost } from '../core/nuke';
import { handleQuickAction, type QuickActionType } from '../core/quickActions.js';

type NukeFormValues = {
  remove?: boolean;
  lock?: boolean;
  skipDistinguished?: boolean;
  targetId?: string;
};

export const forms = new Hono();

const normalizeValues = (values: NukeFormValues) => ({
  remove: Boolean(values.remove),
  lock: Boolean(values.lock),
  skipDistinguished: Boolean(values.skipDistinguished),
});

const getTargetId = (values: NukeFormValues) => {
  if (typeof values.targetId === 'string' && values.targetId.trim()) {
    return values.targetId.trim();
  }

  return context.postId;
};

forms.post('/mop-comment-submit', async (c) => {
  const values = await c.req.json<NukeFormValues>();
  console.log('values', values);
  const normalized = normalizeValues(values);

  if (!normalized.lock && !normalized.remove) {
    return c.json<UiResponse>(
      {
        showToast: 'You must select either lock or remove.',
      },
      200
    );
  }

  const targetId = getTargetId(values);
  if (!isT1(targetId)) {
    console.error('targetId is not a T1', targetId);
    return c.json<UiResponse>(
      {
        showToast: 'Mop failed! Please try again later.',
      },
      200
    );
  }

  const result = await handleNuke({
    ...normalized,
    commentId: targetId,
    subredditId: context.subredditId,
  });

  console.log(
    `Mop result - ${result.success ? 'success' : 'fail'} - ${result.message}`
  );

  return c.json<UiResponse>(
    {
      showToast: `${result.success ? 'Success' : 'Failed'} : ${result.message}`,
    },
    200
  );
});

forms.post('/mop-post-submit', async (c) => {
  const values = await c.req.json<NukeFormValues>();
  console.log('values', values);
  const normalized = normalizeValues(values);

  if (!normalized.lock && !normalized.remove) {
    return c.json<UiResponse>(
      {
        showToast: 'You must select either lock or remove.',
      },
      200
    );
  }

  const targetId = getTargetId(values);
  if (!isT3(targetId)) {
    console.error('targetId is not a T3', targetId);
    return c.json<UiResponse>(
      {
        showToast: 'Mop failed! Please try again later.',
      },
      200
    );
  }

  const result = await handleNukePost({
    ...normalized,
    postId: targetId,
    subredditId: context.subredditId,
  });

  console.log(
    `Mop result - ${result.success ? 'success' : 'fail'} - ${result.message}`
  );

  return c.json<UiResponse>(
    {
      showToast: `${result.success ? 'Success' : 'Failed'} : ${result.message}`,
    },
    200
  );
});

// ─── X-Ray Quick Action ───────────────────────────────────────────────────────

type XRayFormValues = {
  targetId?: string;
  action?: string | string[];
  note?: string;
};

async function handleXRaySubmit(values: XRayFormValues): Promise<UiResponse> {
  const targetId = values.targetId ?? context.postId;
  if (!targetId) {
    return { showToast: 'No target ID found.' };
  }

  const rawAction = Array.isArray(values.action) ? values.action[0] : values.action;
  if (!rawAction || rawAction === 'none') {
    return { showToast: 'No action selected.' };
  }

  const mod = context.username ?? 'unknown';
  const result = await handleQuickAction(rawAction as QuickActionType, targetId, mod, values.note);
  return { showToast: result.message };
}

forms.post('/xray-post-submit', async (c) => {
  const values = await c.req.json<XRayFormValues>();
  return c.json<UiResponse>(await handleXRaySubmit(values), 200);
});

forms.post('/xray-comment-submit', async (c) => {
  const values = await c.req.json<XRayFormValues>();
  return c.json<UiResponse>(await handleXRaySubmit(values), 200);
});

// ─── Team Queue Submit ────────────────────────────────────────────────────────

forms.post('/team-queue-submit', async (c) => {
  const values = await c.req.json<Record<string, string | string[]>>();
  const { settings } = await import('@devvit/web/server');
  const threshold = (await settings.get<number>('teamReviewThreshold')) ?? 2;
  const { getVotes, setVotes } = await import('../core/redis.js');

  const voteKeys = Object.keys(values).filter((k) => k.startsWith('vote_'));
  const results: string[] = [];

  for (const key of voteKeys) {
    const itemId = key.replace(/^vote_/, '');
    const rawVote = Array.isArray(values[key]) ? values[key][0] : values[key];
    if (!rawVote || rawVote === 'none') continue;

    const existing = (await getVotes(itemId)) ?? {
      itemId,
      votes: {},
      updatedAt: Date.now(),
    };
    const vote = rawVote as 'approve' | 'remove' | 'discuss';
    existing.votes[context.username ?? 'unknown'] = vote;
    existing.updatedAt = Date.now();
    await setVotes(existing);

    // Count votes for this action
    const actionVotes = Object.values(existing.votes).filter((v) => v === vote).length;
    if ((vote === 'approve' || vote === 'remove') && actionVotes >= threshold) {
      const { handleQuickAction } = await import('../core/quickActions.js');
      await handleQuickAction(vote, itemId, context.username ?? 'unknown');
      results.push(`${itemId}: auto-${vote}d (${actionVotes}/${threshold} votes)`);
    } else {
      results.push(`${itemId}: vote recorded (${vote})`);
    }
  }

  const msg = results.length > 0 ? results.join(' · ') : 'No votes submitted.';
  return c.json<UiResponse>({ showToast: msg }, 200);
});
