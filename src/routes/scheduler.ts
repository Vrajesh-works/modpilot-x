import { Hono } from 'hono';
import { buildAndStoreDailyDigest } from '../core/digestBuilder.js';
import { runPatternDetection } from '../core/patternDetector.js';

export const schedulerRoutes = new Hono();

schedulerRoutes.post('/daily-digest', async (c) => {
  try {
    const stats = await buildAndStoreDailyDigest();
    console.log(`[ModPilot] Daily digest built: ${JSON.stringify(stats)}`);
  } catch (err) {
    console.error('[ModPilot] daily-digest job failed:', err);
  }
  return c.json({}, 200);
});

schedulerRoutes.post('/pattern-detector', async (c) => {
  try {
    await runPatternDetection();
    console.log('[ModPilot] Pattern detection completed');
  } catch (err) {
    console.error('[ModPilot] pattern-detector job failed:', err);
  }
  return c.json({}, 200);
});
