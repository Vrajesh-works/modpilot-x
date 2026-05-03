import { settings } from '@devvit/web/server';
import { type EnrichedItem, addToHighRiskQueue, isBaselineActive, setBaselineSample, setItem } from './redis.js';
import { getOrBuildAuthorProfile } from './authorProfiler.js';
import { analyzeText } from './textAnalyzer.js';
import { computeRiskScore } from './riskScorer.js';

export async function enrichAndStore(
  itemId: string,
  itemType: 'post' | 'comment',
  authorUsername: string,
  bodyText: string,
  subredditName: string,
  title?: string
): Promise<EnrichedItem> {
  const [authorProfile, threshold] = await Promise.all([
    getOrBuildAuthorProfile(authorUsername),
    settings.get<number>('riskThreshold'),
  ]);

  const textSignals = analyzeText(bodyText);
  const riskScore = computeRiskScore(authorProfile, textSignals);

  const item: EnrichedItem = {
    itemId,
    itemType,
    authorUsername,
    ...(title !== undefined ? { title } : {}),
    body: bodyText.slice(0, 500),
    authorProfile,
    textSignals,
    riskScore,
    enrichedAt: Date.now(),
  };

  const baseline = await isBaselineActive();
  if (baseline) {
    await setBaselineSample(item);
    console.log(`[ModPilot] Baseline mode: stored sample ${itemId} (not scored)`);
  } else {
    await setItem(item);
    const minScore = threshold ?? 7;
    if (riskScore.score >= minScore) {
      await addToHighRiskQueue(itemId, riskScore.score);
      console.log(`[ModPilot] Flagged ${itemId} (score ${riskScore.score}) in r/${subredditName}`);
    }
  }

  return item;
}
