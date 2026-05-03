import { settings } from '@devvit/web/server';
import {
  type DigestStats,
  getDailyStat,
  getHighRiskQueue,
  getHighRiskQueueSize,
  getItem,
  setDigest,
} from './redis.js';
import { computeAgreementRate } from './feedbackLoop.js';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function buildAndStoreDailyDigest(): Promise<DigestStats> {
  const today = todayIso();

  const [enriched, approvals, removals, queueSize, agreementRate, topItems] = await Promise.all([
    getDailyStat(today, 'enriched'),
    getDailyStat(today, 'approvals'),
    getDailyStat(today, 'removals'),
    getHighRiskQueueSize(),
    computeAgreementRate(),
    getHighRiskQueue(10),
  ]);

  // Compute average score from current high-risk queue
  let avgScore = 0;
  if (topItems.length > 0) {
    avgScore = topItems.reduce((sum, e) => sum + e.score, 0) / topItems.length;
    avgScore = Math.round(avgScore * 10) / 10;
  }

  const stats: DigestStats = {
    date: today,
    totalEnriched: enriched,
    highRiskCount: queueSize,
    approvedCount: approvals,
    removedCount: removals,
    avgScore,
    agreementRate,
  };

  await setDigest(stats);

  const webhookUrl = await settings.get<string>('digestWebhookUrl');
  if (webhookUrl && webhookUrl.trim()) {
    await sendDiscordDigest(stats, webhookUrl.trim(), topItems);
  }

  return stats;
}

async function sendDiscordDigest(
  stats: DigestStats,
  webhookUrl: string,
  topItems: { member: string; score: number }[]
): Promise<void> {
  const topLines: string[] = [];
  for (const entry of topItems.slice(0, 5)) {
    const item = await getItem(entry.member);
    if (item) {
      topLines.push(`• ${entry.member} — Score ${entry.score}/10 — u/${item.authorUsername}`);
    }
  }

  const description =
    `**${stats.date}**\n\n` +
    `Items enriched: **${stats.totalEnriched}**\n` +
    `High-risk queue: **${stats.highRiskCount}**\n` +
    `Approved: **${stats.approvedCount}** · Removed: **${stats.removedCount}**\n` +
    `Avg risk score: **${stats.avgScore}**\n` +
    `Mod agreement rate: **${stats.agreementRate}%**\n` +
    (topLines.length > 0 ? `\n**Top flagged items:**\n${topLines.join('\n')}` : '');

  const payload = {
    embeds: [
      {
        title: 'ModPilot Daily Digest',
        description,
        color: 0xff4500,
        footer: { text: 'ModPilot-X' },
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error(`[ModPilot] Discord webhook returned ${response.status}`);
    }
  } catch (err) {
    console.error('[ModPilot] Discord webhook send failed:', err);
  }
}
