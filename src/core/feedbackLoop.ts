import {
  type FeedbackRecord,
  getFeedback,
  getRecentFeedbackIds,
  setFeedback,
} from './redis.js';

export async function recordFeedback(
  itemId: string,
  predictedTier: string,
  actualAction: 'approve' | 'remove' | 'ignore'
): Promise<void> {
  const agreedWithPrediction =
    (predictedTier === 'high' || predictedTier === 'critical') && actualAction === 'remove'
    || predictedTier === 'low' && actualAction === 'approve';

  const fb: FeedbackRecord = {
    itemId,
    predictedTier,
    actualAction,
    agreedWithPrediction,
    recordedAt: Date.now(),
  };
  await setFeedback(fb);
}

export async function computeAgreementRate(): Promise<number> {
  const ids = await getRecentFeedbackIds(50);
  if (ids.length === 0) return 0;

  const records = await Promise.all(ids.map((id) => getFeedback(id)));
  const valid = records.filter((r): r is FeedbackRecord => r !== undefined);
  if (valid.length === 0) return 0;

  const agreed = valid.filter((r) => r.agreedWithPrediction).length;
  return Math.round((agreed / valid.length) * 100);
}
