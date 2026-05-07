import { readFile, writeFile, mkdir, rm, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

export const EDITOR_DIR = join(process.cwd(), 'data', 'editor');

export interface EditorClip {
  id: string;
  start: number;
  end: number;
  selected: boolean;
}

export interface EditorProject {
  id: string;
  userId: string;
  title: string;
  videoName: string | null;
  videoExt: string | null;
  videoDuration: number | null;
  status: 'empty' | 'processing' | 'ready' | 'error';
  clips: EditorClip[];
  exportReady: boolean;
  createdAt: string;
  error?: string;
}

export function projectDir(id: string) {
  return join(EDITOR_DIR, id);
}

export function videoPath(id: string, ext: string) {
  return join(EDITOR_DIR, id, `original${ext}`);
}

export function exportPath(id: string) {
  return join(EDITOR_DIR, id, 'export.mp4');
}

export async function getProject(id: string): Promise<EditorProject | null> {
  try {
    const data = await readFile(join(EDITOR_DIR, id, 'project.json'), 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function saveProject(project: EditorProject): Promise<void> {
  const dir = join(EDITOR_DIR, project.id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'project.json'), JSON.stringify(project, null, 2));
}

export async function listUserProjects(userId: string): Promise<EditorProject[]> {
  try {
    await mkdir(EDITOR_DIR, { recursive: true });
    const entries = await readdir(EDITOR_DIR);
    const projects: EditorProject[] = [];
    for (const entry of entries) {
      const project = await getProject(entry);
      if (project && project.userId === userId) projects.push(project);
    }
    return projects.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch {
    return [];
  }
}

export async function deleteProject(id: string): Promise<void> {
  const dir = join(EDITOR_DIR, id);
  if (existsSync(dir)) await rm(dir, { recursive: true, force: true });
}
