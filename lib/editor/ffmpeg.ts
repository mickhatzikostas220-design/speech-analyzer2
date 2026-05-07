import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

const execAsync = promisify(exec);

export interface Segment {
  start: number;
  end: number;
}

export async function getVideoDuration(videoPath: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
  );
  return parseFloat(stdout.trim());
}

export async function detectSpeechSegments(
  videoPath: string,
  noiseDb = -30,
  minSilenceDuration = 0.5
): Promise<Segment[]> {
  const duration = await getVideoDuration(videoPath);

  const { stderr } = await execAsync(
    `ffmpeg -i "${videoPath}" -af "silencedetect=noise=${noiseDb}dB:d=${minSilenceDuration}" -f null - 2>&1`,
    { maxBuffer: 10 * 1024 * 1024 }
  );

  const starts = Array.from(stderr.matchAll(/silence_start: ([\d.]+)/g)).map(m => parseFloat(m[1]));
  const ends = Array.from(stderr.matchAll(/silence_end: ([\d.]+)/g)).map(m => parseFloat(m[1]));

  const silences: Segment[] = starts.map((start, i) => ({
    start,
    end: ends[i] ?? duration,
  }));

  return invertSegments(silences, duration);
}

function invertSegments(silences: Segment[], duration: number): Segment[] {
  if (silences.length === 0) return [{ start: 0, end: duration }];

  const speech: Segment[] = [];
  let cursor = 0;

  for (const silence of silences) {
    if (silence.start > cursor + 0.1) speech.push({ start: cursor, end: silence.start });
    cursor = silence.end;
  }

  if (cursor < duration - 0.1) speech.push({ start: cursor, end: duration });

  return speech;
}

export async function exportSegments(
  inputPath: string,
  segments: Segment[],
  outputPath: string
): Promise<void> {
  if (segments.length === 0) throw new Error('No segments to export');

  await mkdir(dirname(outputPath), { recursive: true });

  if (segments.length === 1) {
    const { start, end } = segments[0];
    await execAsync(
      `ffmpeg -y -i "${inputPath}" -ss ${start} -to ${end} -c copy "${outputPath}"`,
      { maxBuffer: 10 * 1024 * 1024, timeout: 600000 }
    );
    return;
  }

  const videoFilters = segments.map(
    (seg, i) => `[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[v${i}]`
  );
  const audioFilters = segments.map(
    (seg, i) => `[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[a${i}]`
  );
  const concatInputs = segments.map((_, i) => `[v${i}][a${i}]`).join('');
  const filterComplex = [
    ...videoFilters,
    ...audioFilters,
    `${concatInputs}concat=n=${segments.length}:v=1:a=1[outv][outa]`,
  ].join(';');

  await execAsync(
    `ffmpeg -y -i "${inputPath}" -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k "${outputPath}"`,
    { maxBuffer: 50 * 1024 * 1024, timeout: 600000 }
  );
}
