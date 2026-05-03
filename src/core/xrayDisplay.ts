import type { FormField } from '@devvit/shared-types/shared/form.js';
import type { EnrichedItem } from './redis.js';

export type XRayForm = {
  fields: FormField[];
  title: string;
  description: string;
  acceptLabel: string;
  cancelLabel: string;
};

export function buildXRayForm(item: EnrichedItem, claimedBy?: string): XRayForm {
  const { riskScore, authorProfile, textSignals } = item;
  const title = item.title
    ? item.title.slice(0, 60) + (item.title.length > 60 ? '…' : '')
    : `Comment by u/${item.authorUsername}`;

  const fields: FormField[] = [
    // ── Hidden target ID ──
    {
      name: 'targetId',
      label: 'Target ID',
      type: 'string',
      required: true,
      defaultValue: item.itemId,
    },

    // ── Risk Score ──
    {
      name: 'riskScore',
      label: 'Risk Score',
      type: 'string',
      defaultValue: `${riskScore.score}/10 — ${riskScore.tier.toUpperCase()}`,
    },
    {
      name: 'rationale',
      label: 'Rationale',
      type: 'paragraph',
      defaultValue: riskScore.rationale,
    },

    // ── Author Profile ──
    {
      name: 'authorTier',
      label: 'Author Tier',
      type: 'string',
      defaultValue: authorProfile.tier.toUpperCase(),
    },
    {
      name: 'accountAge',
      label: 'Account Age',
      type: 'string',
      defaultValue: `${authorProfile.accountAgeDays} days`,
    },
    {
      name: 'karma',
      label: 'Karma',
      type: 'string',
      defaultValue: `Link: ${authorProfile.linkKarma} · Comment: ${authorProfile.commentKarma}`,
    },
    {
      name: 'priorActions',
      label: 'Prior Mod Actions',
      type: 'string',
      defaultValue: `${authorProfile.priorRemovals} removal(s) · ${authorProfile.priorApprovals} approval(s)`,
    },

    // ── Text Signals ──
    {
      name: 'hedging',
      label: 'Hedging Density',
      type: 'string',
      defaultValue: `${(textSignals.hedgingDensity * 100).toFixed(1)}%`,
    },
    {
      name: 'uniformity',
      label: 'Sentence Uniformity',
      type: 'string',
      defaultValue: `${(textSignals.sentenceUniformity * 100).toFixed(0)}% (${textSignals.sentenceUniformity > 0.7 ? 'HIGH' : 'normal'})`,
    },
    {
      name: 'ttr',
      label: 'Vocabulary Diversity (TTR)',
      type: 'string',
      defaultValue: `${textSignals.ttr.toFixed(2)} (${textSignals.ttr < 0.45 ? 'low' : 'normal'})`,
    },
    {
      name: 'fkGrade',
      label: 'Readability Grade',
      type: 'string',
      defaultValue: `FK ${textSignals.fleschKincaid.toFixed(1)}`,
    },
    {
      name: 'patterns',
      label: 'Structural Patterns',
      type: 'string',
      defaultValue:
        textSignals.structuralPatterns.length > 0
          ? textSignals.structuralPatterns.join(', ')
          : 'none',
    },

    // ── Claim status (if applicable) ──
    ...(claimedBy
      ? ([
          {
            name: 'claimStatus',
            label: 'Claim Status',
            type: 'string',
            defaultValue: `Being reviewed by u/${claimedBy}`,
          },
        ] as FormField[])
      : []),

    // ── Action (enabled) ──
    {
      name: 'action',
      label: 'Action',
      type: 'select',
      options: [
        { label: 'No action', value: 'none' },
        { label: 'Approve', value: 'approve' },
        { label: 'Remove', value: 'remove' },
        { label: 'Snooze 24h', value: 'snooze' },
        { label: 'Flag for team review', value: 'flag-for-team' },
      ],
      defaultValue: ['none'],
      multiSelect: false,
    },
    {
      name: 'note',
      label: 'Mod note (optional)',
      type: 'string',
      required: false,
    },
  ];

  return {
    fields,
    title: `ModPilot X-Ray: ${title}`,
    description: `u/${item.authorUsername} · ${item.itemType} · ${new Date(item.enrichedAt).toLocaleString()}`,
    acceptLabel: 'Execute Action',
    cancelLabel: 'Close',
  };
}
