export interface TribeResponse {
  engagement_timeline: { timecode_ms: number; score: number }[];
  overall_score: number;
  low_engagement_moments: { start_ms: number; end_ms: number; score: number }[];
}

export async function callTribeV2(
  signedFileUrl: string,
  durationSeconds: number
): Promise<TribeResponse> {
  const serverUrl = process.env.TRIBE_SERVER_URL;

  if (!serverUrl) {
    return generateMockResponse(durationSeconds);
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.TRIBE_SERVER_SECRET) {
    headers['Authorization'] = `Bearer ${process.env.TRIBE_SERVER_SECRET}`;
  }

  const res = await fetch(serverUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ file_url: signedFileUrl, duration_seconds: durationSeconds }),
    signal: AbortSignal.timeout(300_000),
  });

  if (!res.ok) {
    throw new Error(`Tribe server returned ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

// Realistic mock: random walk with mean reversion, seeded drops for demo variety
function generateMockResponse(durationSeconds: number): TribeResponse {
  const n = Math.max(10, Math.floor(durationSeconds));
  const timeline: { timecode_ms: number; score: number }[] = [];

  let score = 62 + (Math.random() - 0.5) * 16;

  for (let i = 0; i < n; i++) {
    score += (68 - score) * 0.06 + (Math.random() - 0.5) * 14;
    score = Math.max(18, Math.min(100, score));
    timeline.push({ timecode_ms: i * 1000, score: Math.round(score) });
  }

  const overallScore = Math.round(
    timeline.reduce((s, t) => s + t.score, 0) / timeline.length
  );

  const THRESHOLD = 55;
  const lowMoments: { start_ms: number; end_ms: number; score: number }[] = [];
  let inLow = false;
  let lowStart = 0;
  const lowBucket: number[] = [];

  for (let i = 0; i < timeline.length; i++) {
    const { timecode_ms, score: s } = timeline[i];
    if (s < THRESHOLD && !inLow) {
      inLow = true;
      lowStart = timecode_ms;
      lowBucket.length = 0;
      lowBucket.push(s);
    } else if (s < THRESHOLD) {
      lowBucket.push(s);
    } else if (inLow) {
      const durationMs = timecode_ms - lowStart;
      if (durationMs >= 2000) {
        const avg = Math.round(lowBucket.reduce((a, b) => a + b, 0) / lowBucket.length);
        lowMoments.push({ start_ms: lowStart, end_ms: timeline[i - 1].timecode_ms + 1000, score: avg });
      }
      inLow = false;
    }
  }

  return { engagement_timeline: timeline, overall_score: overallScore, low_engagement_moments: lowMoments };
}
