import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAssistantMessageEventStream, type AssistantMessage } from '@earendil-works/pi-ai';
import { afterEach, describe, expect, it } from 'vitest';
import type { StreamEvent } from '../src/shared/types.js';
import { ProjectStore } from '../src/main/pi/project-store.js';
import { SessionHub } from '../src/main/pi/session-hub.js';

describe('SessionHub event commitment ordering', () => {
  const tempDirs: string[] = [];
  const tempSessionFiles: string[] = [];

  afterEach(() => {
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
});
