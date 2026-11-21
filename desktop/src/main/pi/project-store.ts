import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import type { ProjectRecord, ThemeMode } from '../../shared/types.js';

interface PersistedProjectsData {
  version: 1;
  theme: ThemeMode;
  sidebarCollapsed: boolean;
  projects: ProjectRecord[];
  archivedSessions: string[];
}

export class ProjectStore {
  private readonly filePath: string;
  private data: PersistedProjectsData;

  constructor(storeDir: string = join(homedir(), '.shannon')) {
    this.filePath = join(storeDir, 'projects.json');
    this.data = this.load();
  }

  private load(): PersistedProjectsData {
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<PersistedProjectsData>;
        return {
          version: 1,
          theme: parsed.theme ?? 'system',
          sidebarCollapsed: parsed.sidebarCollapsed ?? false,
          projects: Array.isArray(parsed.projects) ? parsed.projects : [],
          archivedSessions: Array.isArray(parsed.archivedSessions) ? parsed.archivedSessions : [],
        };
      }
    } catch {
      // Corrupt store falls back cleanly
    }
    return {
      version: 1,
      theme: 'system',
      sidebarCollapsed: false,
      projects: [],
      archivedSessions: [],
    };
  }

  private save(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const tmp = `${this.filePath}.tmp.${process.pid}`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8');
    renameSync(tmp, this.filePath);
  }

  static projectIdForPath(dirPath: string): string {
    const normalized = resolve(dirPath);
    return createHash('sha256').update(normalized).digest('hex').slice(0, 12);
  }

  static getGitBranch(cwd: string): string | undefined {
    try {
      let current = resolve(cwd);
      for (let depth = 0; depth < 8; depth++) {
        const dotGit = join(current, '.git');
        if (existsSync(dotGit)) {
          let gitDir = dotGit;
          try {
            const headFile = join(dotGit, 'HEAD');
            if (!existsSync(headFile)) {
              // Worktree or submodule .git file: "gitdir: ..."
              const content = readFileSync(dotGit, 'utf-8').trim();
              if (content.startsWith('gitdir:')) {
                gitDir = resolve(current, content.slice(7).trim());
              }
            }
            const head = readFileSync(join(gitDir, 'HEAD'), 'utf-8').trim();
            if (head.startsWith('ref: refs/heads/')) {
              return head.slice('ref: refs/heads/'.length);
            }
            if (head.length >= 7) {
              return head.slice(0, 7);
            }
          } catch {
            return undefined;
          }
        }
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  getTheme(): ThemeMode {
    return this.data.theme;
  }

  setTheme(theme: ThemeMode): void {
    this.data.theme = theme;
    this.save();
  }

  getSidebarCollapsed(): boolean {
    return this.data.sidebarCollapsed;
  }

  setSidebarCollapsed(collapsed: boolean): void {
    this.data.sidebarCollapsed = collapsed;
    this.save();
  }

  listProjects(): ProjectRecord[] {
    return this.data.projects
      .map((p) => ({
        ...p,
        gitBranch: ProjectStore.getGitBranch(p.path),
      }))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime();
      });
  }

  findByPath(dirPath: string): ProjectRecord | undefined {
    const resolved = resolve(dirPath);
    return this.data.projects.find((p) => resolve(p.path) === resolved);
  }

  addProject(dirPath: string): ProjectRecord {
    const resolved = resolve(dirPath);
    const existing = this.findByPath(resolved);
    const now = new Date().toISOString();
    if (existing) {
      existing.lastOpenedAt = now;
      this.save();
      return { ...existing, gitBranch: ProjectStore.getGitBranch(existing.path) };
    }
    const project: ProjectRecord = {
      id: ProjectStore.projectIdForPath(resolved),
      name: basename(resolved) || resolved,
      path: resolved,
      pinned: false,
      addedAt: now,
      lastOpenedAt: now,
    };
    this.data.projects.push(project);
    this.save();
    return { ...project, gitBranch: ProjectStore.getGitBranch(project.path) };
  }

  removeProject(projectId: string): void {
    this.data.projects = this.data.projects.filter((p) => p.id !== projectId);
    this.save();
  }

  updateProject(
    projectId: string,
    patch: Partial<Pick<ProjectRecord, 'name' | 'pinned' | 'defaultModel' | 'defaultThinkingLevel' | 'lastOpenedAt'>>,
  ): ProjectRecord {
    const project = this.data.projects.find((p) => p.id === projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    Object.assign(project, patch);
    this.save();
    return { ...project, gitBranch: ProjectStore.getGitBranch(project.path) };
  }

  isSessionArchived(sessionPath: string): boolean {
    const resolved = resolve(sessionPath);
    return this.data.archivedSessions.some((p) => resolve(p) === resolved);
  }

  archiveSession(sessionPath: string): void {
    const resolved = resolve(sessionPath);
    if (!this.isSessionArchived(resolved)) {
      this.data.archivedSessions.push(resolved);
      this.save();
    }
  }

  unarchiveSession(sessionPath: string): void {
    const resolved = resolve(sessionPath);
    const next = this.data.archivedSessions.filter((p) => resolve(p) !== resolved);
    if (next.length !== this.data.archivedSessions.length) {
      this.data.archivedSessions = next;
      this.save();
    }
  }
}
