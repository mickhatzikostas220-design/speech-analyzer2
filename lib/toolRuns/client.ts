// Client helpers for tool-run persistence. Two layers, matching the "both"
// decision: localStorage for instant repaint when you return to a tool, and the
// server (via /api/tool-runs) as the durable, cross-device source of truth.
//
// A page typically does, on mount: hydrate from loadLocalRun() immediately, then
// fetchLatestRun() and hydrate from the server if it has anything (server wins).
// On a successful generation it calls saveLocalRun() (the server copy is written
// by the tool's API route itself).

export interface ToolRunSummary {
  id: string;
  title: string | null;
  created_at: string;
}

export interface LatestResponse<O> {
  latest:
    | { id: string; title: string | null; input: unknown; output: O; created_at: string }
    | null;
  history: ToolRunSummary[];
}

const key = (tool: string) => `toolrun:${tool}:v1`;

export function loadLocalRun<O>(tool: string): O | null {
  try {
    const raw = localStorage.getItem(key(tool));
    return raw ? (JSON.parse(raw) as O) : null;
  } catch {
    return null;
  }
}

export function saveLocalRun<O>(tool: string, output: O): void {
  try {
    localStorage.setItem(key(tool), JSON.stringify(output));
  } catch {
    /* storage full/blocked — the server copy still persists it */
  }
}

export async function fetchLatestRun<O>(tool: string): Promise<LatestResponse<O> | null> {
  try {
    const res = await fetch(`/api/tool-runs?tool=${encodeURIComponent(tool)}`);
    if (!res.ok) return null;
    return (await res.json()) as LatestResponse<O>;
  } catch {
    return null;
  }
}

export async function fetchRunById<O>(tool: string, id: string): Promise<O | null> {
  try {
    const res = await fetch(
      `/api/tool-runs?tool=${encodeURIComponent(tool)}&id=${encodeURIComponent(id)}`
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { run?: { output?: O } };
    return j.run?.output ?? null;
  } catch {
    return null;
  }
}
