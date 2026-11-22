import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAssistantMessageEventStream, type AssistantMessage } from '@earendil-works/pi-ai';
import { AgentSession, SessionManager } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StreamEvent } from '../src/shared/types.js';
import { ProjectStore } from '../src/main/pi/project-store.js';
import { SessionHub } from '../src/main/pi/session-hub.js';

function deferred<T>() {
  let resolve!: (result: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

describe('SessionHub event commitment ordering', () => {
  const tempDirs: string[] = [];
  const tempSessionFiles: string[] = [];

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    for (const f of tempSessionFiles.splice(0)) {
      rmSync(f, { force: true });
    }
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('commits both user and assistant messages on the very first turn without needing a second prompt', async () => {
    const root = mkdtempSync(join(tmpdir(), 'shannon-hub-'));
    tempDirs.push(root);

    const agentDir = join(root, 'agent');
    const storeDir = join(root, 'store');
    const cwd = join(root, 'project');
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(storeDir, { recursive: true });
    mkdirSync(cwd, { recursive: true });

    // Configure a local custom provider & model in temp agentDir
    writeFileSync(
      join(agentDir, 'models.json'),
      JSON.stringify({
        providers: {
          'test-provider': {
            name: 'Test Provider',
            baseUrl: 'http://127.0.0.1:9/v1',
            api: 'openai-completions',
            apiKey: 'sk-test-1234',
            models: [
              {
                id: 'test-model',
                name: 'Test Model',
                reasoning: false,
                input: ['text'],
                contextWindow: 128000,
                maxTokens: 4096,
              },
            ],
          },
        },
      }),
      'utf-8',
    );

    const prevAgentDirEnv = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;

    const events: StreamEvent[] = [];
    const projectStore = new ProjectStore(storeDir);
    const hub = new SessionHub(projectStore, (e) => events.push(e), agentDir);

    try {
      const initial = await hub.createSession({ cwd });
      if (initial.sessionFile) tempSessionFiles.push(initial.sessionFile);
      await hub.setModel(initial.sessionId, 'test-provider', 'test-model');

      // Inject an in-process streamFunction on the managed AgentSession's agent
      const managed = (hub as unknown as { active: Map<string, { session: { agent: { streamFunction: unknown } } }> }).active.get(
        initial.sessionId,
      )!;

      managed.session.agent.streamFunction = (model: { api: string; provider: string; id: string }) => {
        const stream = createAssistantMessageEventStream();
        queueMicrotask(() => {
          const partial: AssistantMessage = {
            role: 'assistant',
            content: [{ type: 'text', text: '' }],
            api: model.api as AssistantMessage['api'],
            provider: model.provider,
            model: model.id,
            usage: {
              input: 100,
              output: 12,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 112,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'stop',
            timestamp: Date.now(),
          };
          stream.push({ type: 'start', partial });
          stream.push({ type: 'text_start', contentIndex: 0, partial });
          stream.push({ type: 'text_delta', contentIndex: 0, delta: 'Immediate reply!', partial });
          const finalMsg: AssistantMessage = {
            ...partial,
            content: [{ type: 'text', text: 'Immediate reply!' }],
          };
          stream.push({ type: 'text_end', contentIndex: 0, content: 'Immediate reply!', partial: finalMsg });
          stream.push({ type: 'done', reason: 'stop', message: finalMsg });
        });
        return stream;
      };

      await hub.prompt(initial.sessionId, 'hello first turn');

      // Wait for agent_settled -> session_reloaded
      const reloaded = await new Promise<Extract<StreamEvent, { type: 'session_reloaded' }>>(
        (resolve, reject) => {
          const deadline = setTimeout(
            () =>
              reject(
                new Error(
                  `Timed out waiting for session_reloaded. Events: ${JSON.stringify(events)}`,
                ),
              ),
            1500,
          );
          const check = () => {
            const found = events.find(
              (e): e is Extract<StreamEvent, { type: 'session_reloaded' }> =>
                e.type === 'session_reloaded' &&
                e.snapshot.messages.some((m) => m.role === 'assistant'),
            );
            if (found) {
              clearTimeout(deadline);
              resolve(found);
            } else {
              setTimeout(check, 20);
            }
          };
          check();
        },
      );

      const committedMessages = events
        .filter(
          (e): e is Extract<StreamEvent, { type: 'message_committed' }> =>
            e.type === 'message_committed',
        )
        .map((e) => e.message);

      expect(committedMessages.some((m) => m.role === 'user' && m.text === 'hello first turn')).toBe(
        true,
      );
      expect(
        committedMessages.some(
          (m) =>
            m.role === 'assistant' &&
            m.blocks?.some((b) => b.type === 'text' && b.text === 'Immediate reply!'),
        ),
      ).toBe(true);

      expect(reloaded.snapshot.messages).toHaveLength(2);
      expect(reloaded.snapshot.messages[0].role).toBe('user');
      expect(reloaded.snapshot.messages[1].role).toBe('assistant');
      expect(reloaded.snapshot.name).toBe('hello first turn');
    } finally {
      await hub.disposeAll();
      if (prevAgentDirEnv === undefined) {
        delete process.env.PI_CODING_AGENT_DIR;
      } else {
        process.env.PI_CODING_AGENT_DIR = prevAgentDirEnv;
      }
    }
  });

  function makeHub() {
    const root = mkdtempSync(join(tmpdir(), 'shannon-hub-'));
    tempDirs.push(root);
    const agentDir = join(root, 'agent');
    const cwd = join(root, 'project');
    mkdirSync(agentDir);
    mkdirSync(cwd);
    vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
    const events: StreamEvent[] = [];
    const hub = new SessionHub(new ProjectStore(join(root, 'store')), (e) => events.push(e), agentDir);
    return { agentDir, cwd, events, hub };
  }

  it('keeps a handled Pi extension command out of the streaming state', async () => {
    const { agentDir, cwd, events, hub } = makeHub();
    const extensionsDir = join(agentDir, 'extensions');
    mkdirSync(extensionsDir);
    writeFileSync(join(extensionsDir, 'test-noop.ts'), `
      export default function (pi) {
        pi.registerCommand('test-noop', { description: 'Test command', handler: async () => {} });
      }
    `);

    try {
      const session = await hub.createSession({ cwd });
      await expect(hub.prompt(session.sessionId, '/test-noop')).resolves.toEqual({ disposition: 'handled' });
      const snapshot = await hub.openSession(session.sessionFile!);
      expect(snapshot.isStreaming).toBe(false);
      expect(events.some((event) => event.type === 'session_status' && event.isStreaming)).toBe(false);
    } finally {
      await hub.disposeAll();
    }
  });

  it('loads CLI appends on reopen, reload and before a desktop write', async () => {
    const { cwd, hub } = makeHub();
    const sessionManager = SessionManager.create(cwd);
    const appendUser = (manager: SessionManager, content: string) =>
      manager.appendMessage({ role: 'user', content, timestamp: Date.now() });
    appendUser(sessionManager, 'Original prompt');
    const path = sessionManager.getSessionFile()!;

    try {
      const initial = await hub.openSession(path);
      appendUser(SessionManager.open(path), 'CLI prompt before reopen');
      const [reopened, alsoReopened] = await Promise.all([hub.openSession(path), hub.openSession(path)]);
      expect(reopened.sessionId).toBe(initial.sessionId);
      expect(alsoReopened.messages).toEqual(reopened.messages);
      expect(reopened.messages.map((m) => m.text)).toEqual(['Original prompt', 'CLI prompt before reopen']);

      appendUser(SessionManager.open(path), 'CLI prompt before reload');
      const reloaded = await hub.reloadSession(initial.sessionId);
      expect(reloaded.messages.at(-1)?.text).toBe('CLI prompt before reload');

      const externalEntry = appendUser(SessionManager.open(path), 'CLI prompt before write');
      await hub.setSessionName(initial.sessionId, 'Renamed on desktop');
      const saved = SessionManager.open(path);
      expect(saved.getLeafEntry()).toMatchObject({ type: 'session_info', parentId: externalEntry });
      expect(saved.getBranch().map((entry) => entry.id)).toContain(externalEntry);
    } finally {
      await hub.disposeAll();
    }
  });

  it('keeps a manually selected branch when only desktop entries changed on disk', async () => {
    const { cwd, hub } = makeHub();
    const manager = SessionManager.create(cwd);
    manager.appendMessage({ role: 'user', content: 'Original prompt', timestamp: Date.now() });
    const target = manager.appendSessionInfo('First title');
    const path = manager.getSessionFile()!;

    try {
      const initial = await hub.openSession(path);
      await hub.setSessionName(initial.sessionId, 'Newer title');
      await hub.navigateTree(initial.sessionId, target);
      await hub.setSessionName(initial.sessionId, 'Branch title');
      expect(SessionManager.open(path).getLeafEntry()).toMatchObject({
        type: 'session_info',
        name: 'Branch title',
        parentId: target,
      });
    } finally {
      await hub.disposeAll();
    }
  });

  it('keeps the current Bash run after rejecting another command, even during cancellation', async () => {
    const { cwd, events, hub } = makeHub();
    type BashResult = Awaited<ReturnType<AgentSession['executeBash']>>;
    const cancelled: BashResult = { output: '', exitCode: undefined, cancelled: true, truncated: false };
    const result = deferred<BashResult>();
    const running = deferred<void>();
    const sdkBash = vi.spyOn(AgentSession.prototype, 'executeBash').mockImplementation(async () => {
      running.resolve();
      return result.promise;
    });
    const sdkAbort = vi.spyOn(AgentSession.prototype, 'abortBash').mockImplementation(() => {});

    try {
      const session = await hub.createSession({ cwd });
      const first = hub.executeBash(session.sessionId, 'first', false);
      await running.promise;
      await expect(hub.executeBash(session.sessionId, 'second', false)).rejects.toThrow('already running');
      await hub.abortBash(session.sessionId);
      expect(sdkAbort).toHaveBeenCalledOnce();
      expect((await hub.openSession(session.sessionFile!)).isBashRunning).toBe(true);
      expect(sdkBash).toHaveBeenCalledOnce();

      result.resolve(cancelled);
      await first;
      expect((await hub.openSession(session.sessionFile!)).isBashRunning).toBe(false);
      await hub.executeBash(session.sessionId, 'third', false);
      expect(sdkBash).toHaveBeenCalledTimes(2);
      const updates = events.filter((event) => event.type === 'bash_update');
      expect(updates.map((event) => event.command)).toEqual(['first', 'first', 'third', 'third']);
    } finally {
      result.resolve(cancelled);
      await hub.disposeAll();
    }
  });
});
