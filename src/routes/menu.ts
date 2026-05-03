import { Hono } from 'hono';
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared';
import type { FormField } from '@devvit/shared-types/shared/form.js';
import { enrichAndStore } from '../core/enrichment.js';
import { buildXRayForm } from '../core/xrayDisplay.js';
import { claimItem, isClaimedByOther } from '../core/claimSystem.js';
import { clearBaselineActive, getItem, getTeamReviewQueue } from '../core/redis.js';
import { context } from '@devvit/web/server';

export const menu = new Hono();

const buildNukeFields = (targetId: string): FormField[] => [
  {
    name: 'targetId',
    label: 'Target ID',
    type: 'string',
    helpText: 'Auto-filled from the selected item.',
    required: true,
    defaultValue: targetId,
  },
  {
    name: 'remove',
    label: 'Remove comments',
    type: 'boolean',
    defaultValue: true,
  },
  {
    name: 'lock',
    label: 'Lock comments',
    type: 'boolean',
    defaultValue: false,
  },
  {
    name: 'skipDistinguished',
    label: 'Skip distinguished comments',
    type: 'boolean',
    defaultValue: false,
  },
];

const buildNukeForm = (title: string, targetId: string) => ({
  fields: buildNukeFields(targetId),
  title,
  acceptLabel: 'Mop',
  cancelLabel: 'Cancel',
});

menu.post('/mop-comment', async (c) => {
  const request = await c.req.json<MenuItemRequest>();
  console.log('request', request.targetId);
  return c.json<UiResponse>(
    {
      showForm: {
        name: 'mopComment',
        form: buildNukeForm('Mop Comments', request.targetId),
      },
    },
    200
  );
});

menu.post('/mop-post', async (c) => {
  const request = await c.req.json<MenuItemRequest>();
  return c.json<UiResponse>(
    {
      showForm: {
        name: 'mopPost',
        form: buildNukeForm('Mop Post Comments', request.targetId),
      },
    },
    200
  );
});

// ─── X-Ray ────────────────────────────────────────────────────────────────────

async function handleXRay(
  targetId: string,
  itemType: 'post' | 'comment',
  formName: 'xrayPost' | 'xrayComment'
): Promise<UiResponse> {
  const currentMod = context.username ?? 'unknown';

  // Load or enrich on-demand
  let item = await getItem(targetId);
  if (!item) {
    // No enriched data yet — do a quick inline enrich
    const postId = targetId.replace(/^t[13]_/, '');
    item = await enrichAndStore(targetId, itemType, 'unknown', `[viewed via X-Ray: ${postId}]`, 'unknown');
  }

  // Auto-claim for this mod
  await claimItem(targetId, currentMod);

  // Check if someone else has it
  const claimStatus = await isClaimedByOther(targetId, currentMod);
  const form = buildXRayForm(item, claimStatus.claimed ? claimStatus.by : undefined);

  return {
    showForm: {
      name: formName,
      form,
    },
  };
}

menu.post('/xray-post', async (c) => {
  const request = await c.req.json<MenuItemRequest>();
  const response = await handleXRay(request.targetId, 'post', 'xrayPost');
  return c.json<UiResponse>(response, 200);
});

menu.post('/xray-comment', async (c) => {
  const request = await c.req.json<MenuItemRequest>();
  const response = await handleXRay(request.targetId, 'comment', 'xrayComment');
  return c.json<UiResponse>(response, 200);
});

menu.post('/claim-item', async (c) => {
  const request = await c.req.json<MenuItemRequest>();
  const mod = context.username ?? 'unknown';
  const result = await claimItem(request.targetId, mod);
  return c.json<UiResponse>({ showToast: result.message }, 200);
});

// ─── Team Review Queue ────────────────────────────────────────────────────────

menu.post('/team-queue', async (c) => {
  const queue = await getTeamReviewQueue(5);

  if (queue.length === 0) {
    return c.json<UiResponse>({ showToast: 'No items in the team review queue.' }, 200);
  }

  const fields: FormField[] = [
    {
      name: 'info',
      label: 'Team Review Queue',
      type: 'string',
      defaultValue: `${queue.length} item(s) awaiting team review`,
    },
  ];

  for (const entry of queue) {
    const item = await getItem(entry.member);
    const label = item
      ? `${entry.member} — Score ${item.riskScore.score}/10 — u/${item.authorUsername}`
      : entry.member;
    fields.push({
      name: `vote_${entry.member}`,
      label,
      type: 'select',
      options: [
        { label: 'No vote', value: 'none' },
        { label: 'Approve', value: 'approve' },
        { label: 'Remove', value: 'remove' },
        { label: 'Discuss', value: 'discuss' },
      ],
      defaultValue: ['none'],
      multiSelect: false,
    });
  }

  return c.json<UiResponse>(
    {
      showForm: {
        name: 'teamQueue',
        form: {
          fields,
          title: 'Team Review Queue',
          acceptLabel: 'Submit Votes',
          cancelLabel: 'Close',
        },
      },
    },
    200
  );
});

// ─── Digest on-demand ─────────────────────────────────────────────────────────

menu.post('/send-digest', async (c) => {
  try {
    const { buildAndStoreDailyDigest } = await import('../core/digestBuilder.js');
    await buildAndStoreDailyDigest();
    return c.json<UiResponse>({ showToast: 'Daily digest sent!' }, 200);
  } catch (err) {
    console.error('[ModPilot] send-digest failed:', err);
    return c.json<UiResponse>({ showToast: 'Digest failed. Check server logs.' }, 200);
  }
});

// ─── Exit Baseline Mode ───────────────────────────────────────────────────────

menu.post('/exit-baseline', async (c) => {
  await clearBaselineActive();
  return c.json<UiResponse>({ showToast: 'Baseline mode ended. Items will now be scored.' }, 200);
});
