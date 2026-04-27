export interface ROIActivations {
  auditory: number;
  language: number;
  attention: number;
  dmn: number;
}

export interface ROITimepoint {
  timecode_ms: number;
  auditory: number;
  language: number;
  attention: number;
  dmn: number;
}

export interface TribeResponse {
  engagement_timeline: { timecode_ms: number; score: number }[];
  roi_timeline: ROITimepoint[];
  overall_score: number;
  cognitive_load_score: number;
  mind_wandering_score: number;
  low_engagement_moments: { start_ms: number; end_ms: number; score: number }[];
  peak_moments: { start_ms: number; end_ms: number; score: number }[];
  brain_activations?: {
    overall: ROIActivations;
    moments: ROIActivations[];
  };
  is_mock?: boolean;
}

export async function callTribeV2(
  signedFileUrl: string,
  durationSeconds: number
): Promise<TribeResponse> {
  const serverUrl = process.env.TRIBE_SERVER_URL;

  if (!serverUrl) {
    throw new Error('TRIBE_SERVER_URL is not set. Add the Modal endpoint URL to your Vercel environment variables.');
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.TRIBE_SERVER_SECRET) {
    headers['Authorization'] = `Bearer ${process.env.TRIBE_SERVER_SECRET}`;
  }

  const res = await fetch(serverUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ file_url: signedFileUrl, duration_seconds: durationSeconds }),
    signal: AbortSignal.timeout(900_000),
  });

  if (!res.ok) {
    throw new Error(`Tribe server returned ${res.status}: ${await res.text()}`);
  }

  return res.json();
}
