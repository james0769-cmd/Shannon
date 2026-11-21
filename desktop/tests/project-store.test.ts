import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectStore } from '../src/main/pi/project-store.js';

describe('ProjectStore', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('adds, updates, pins, and removes projects with git branch detection', () => {
    const root = mkdtempSync(join(tmpdir(), 'shannon-proj-'));
    tempDirs.push(root);

    const storeDir = join(root, 'store');
    const repoA = join(root, 'alpha-repo');
    const repoB = join(root, 'beta-repo');
    mkdirSync(join(repoA, '.git'), { recursive: true });
    writeFileSync(join(repoA, '.git', 'HEAD'), 'ref: refs/heads/feat/desktop\n', 'utf-8');
    mkdirSync(repoB, { recursive: true });

    const store = new ProjectStore(storeDir);
    const projA = store.addProject(repoA);
    const projB = store.addProject(repoB);

    expect(projA.name).toBe('alpha-repo');
    expect(projA.gitBranch).toBe('feat/desktop');
    expect(projB.gitBranch).toBeUndefined();

    store.updateProject(projA.id, { pinned: true, name: 'Alpha Custom' });
    const reloaded = new ProjectStore(storeDir);
    const listed = reloaded.listProjects();
    expect(listed.length).toBe(2);
    expect(listed[0].id).toBe(projA.id);
    expect(listed[0].name).toBe('Alpha Custom');
    expect(listed[0].pinned).toBe(true);

    reloaded.removeProject(projB.id);
    expect(reloaded.listProjects().map((p) => p.id)).toEqual([projA.id]);

    const fakeSession = join(root, 'sessions', 's1.jsonl');
    expect(reloaded.isSessionArchived(fakeSession)).toBe(false);
    reloaded.archiveSession(fakeSession);
    expect(new ProjectStore(storeDir).isSessionArchived(fakeSession)).toBe(true);
    reloaded.unarchiveSession(fakeSession);
    expect(new ProjectStore(storeDir).isSessionArchived(fakeSession)).toBe(false);
  });
});
