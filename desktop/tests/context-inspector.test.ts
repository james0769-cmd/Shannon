import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it } from 'vitest';
import { buildContextBreakdown } from '../src/main/pi/context-inspector.js';

describe('ContextInspector & Pi SDK !bash integration', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('breaks down system prompt, AGENTS.md, builtin tools, !bash in-context, and !!bash 0-token', async () => {
    const root = mkdtempSync(join(tmpdir(), 'shannon-ctx-'));
    tempDirs.push(root);

    const cwd = join(root, 'workspace');
    const agentDir = join(root, 'agent');
    const sessionsDir = join(root, 'sessions');

    mkdtempSync(join(root, 'tmp-'));
    // Create workspace with AGENTS.md
    const fs = await import('node:fs');
    fs.mkdirSync(cwd, { recursive: true });
    fs.mkdirSync(agentDir, { recursive: true });
    fs.mkdirSync(sessionsDir, { recursive: true });

    writeFileSync(
      join(cwd, 'AGENTS.md'),
      '# Project Rules\nAlways write clean TypeScript and unit tests.\n'.repeat(10),
      'utf-8',
    );

    const modelRuntime = await ModelRuntime.create({
      authPath: join(agentDir, 'auth.json'),
      modelsPath: join(agentDir, 'models.json'),
      allowModelNetwork: false,
    });

    const settingsManager = SettingsManager.inMemory();
    const sessionManager = SessionManager.create(cwd, sessionsDir);
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
    });
    await resourceLoader.reload();

    const { session } = await createAgentSession({
      cwd,
      agentDir,
      modelRuntime,
      settingsManager,
      sessionManager,
      resourceLoader,
    });

    try {
      // Run !bash (included in context)
      const inCtxRes = await session.executeBash('echo "hello-from-shannon-context"', undefined, {
        excludeFromContext: false,
      });
      expect(inCtxRes.exitCode).toBe(0);
      expect(inCtxRes.output).toContain('hello-from-shannon-context');

      // Run !!bash (excluded from context -> 0 tokens)
      const localRes = await session.executeBash('echo "local-only-secret-output"', undefined, {
        excludeFromContext: true,
      });
      expect(localRes.exitCode).toBe(0);

      // Append a user message so session flushes to disk & user_messages is measured
      session.sessionManager.appendMessage({
        role: 'user',
        content: [{ type: 'text', text: 'Please inspect the bash output above and summarize it.' }],
        timestamp: Date.now(),
      });

      const breakdown = buildContextBreakdown(session, resourceLoader);

      const byKey = new Map(breakdown.categories.map((c) => [c.key, c]));
      expect(byKey.get('system_prompt')?.estimatedTokens).toBeGreaterThan(0);
      expect(byKey.get('project_instructions')?.estimatedTokens).toBeGreaterThan(0);
      expect(byKey.get('project_instructions')?.itemCount).toBe(1);
      expect(byKey.get('tools_builtin')?.estimatedTokens).toBeGreaterThan(0);
      expect(byKey.get('user_messages')?.estimatedTokens).toBeGreaterThan(0);
      expect(byKey.get('bash_in_context')?.estimatedTokens).toBeGreaterThan(0);
      expect(byKey.get('bash_in_context')?.itemCount).toBe(1);
      expect(breakdown.excludedBashCount).toBe(1);

      // Verify tree & isolated branching without mutating original sessionFile
      const tree = session.sessionManager.getTree();
      expect(tree.length).toBeGreaterThan(0);
      const originalFile = session.sessionFile!;
      const leafId = session.sessionManager.getLeafId()!;
      const forkManager = SessionManager.open(originalFile, sessionsDir, cwd);
      const forkedFile = forkManager.createBranchedSession(leafId);
      expect(forkedFile).toBeDefined();
      expect(forkedFile).not.toBe(originalFile);
      expect(session.sessionFile).toBe(originalFile);
    } finally {
      session.dispose();
    }
  });
});
