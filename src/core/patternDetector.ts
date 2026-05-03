import { settings } from '@devvit/web/server';
import {
  currentHourKey,
  getHighRiskQueueSize,
  getHourlyStat,
  getPatternWaveTop,
  getTopRepeatOffenders,
  incrementRepeatOffender,
  isBrigadeAlertActive,
  setBrigadeAlert,
  setHourlyStat,
} from './redis.js';

export async function runPatternDetection(): Promise<void> {
  await Promise.all([detectSpamWave(), detectBrigading(), detectRepeatOffenders()]);
}

async function detectSpamWave(): Promise<void> {
  const topPosters = await getPatternWaveTop(20);
  const spamThreshold = 5;

  for (const poster of topPosters) {
    if (poster.score >= spamThreshold) {
      console.log(
        `[ModPilot] Spam wave: u/${poster.member} posted ${poster.score}x in this hour`
      );
      await incrementRepeatOffender(poster.member);
    }
  }
}

async function detectBrigading(): Promise<void> {
  const hourKey = currentHourKey();
  const prevHourKey = String(Number(hourKey) - 1);

  const currentSize = await getHighRiskQueueSize();
  const prevSize = await getHourlyStat(prevHourKey, 'queue-size');

  await setHourlyStat(hourKey, 'queue-size', currentSize);

  if (prevSize > 0 && currentSize >= prevSize * 2) {
    const alreadyActive = await isBrigadeAlertActive();
    if (!alreadyActive) {
      console.log(
        `[ModPilot] Brigading detected: queue grew from ${prevSize} to ${currentSize}`
      );
      await setBrigadeAlert();
    }
  }
}

async function detectRepeatOffenders(): Promise<void> {
  const threshold = (await settings.get<number>('teamReviewThreshold')) ?? 3;
  const offenders = await getTopRepeatOffenders(10);

  for (const offender of offenders) {
    if (offender.score >= threshold) {
      console.log(
        `[ModPilot] Repeat offender: u/${offender.member} has ${offender.score} violations`
      );
    }
  }
}
