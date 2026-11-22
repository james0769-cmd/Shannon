import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { TerminalHub } from '../src/main/terminal/terminal-hub.js';

function waitForOutput(
  getOutput: () => string,
  substring: string,
  timeoutMs = 5000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const current = getOutput();
      if (current.includes(substring)) {
        clearInterval(timer);
        resolve(current);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for "${substring}" in terminal output: ${current}`));
      }
    }, 30);
  });
}

describe('TerminalHub', () => {
  const hubs: TerminalHub[] = [];

  afterEach(() => {
    while (hubs.length > 0) {
      hubs.pop()?.disposeAll();
    }
  });

  it('spawns an interactive shell, buffers output, resizes, and cleans up', async () => {
    let collected = '';
    const exits: Array<{ id: string; code: number | null }> = [];

    const hub = new TerminalHub(
      (_id, data) => {
        collected += data;
      },
      (id, code) => {
        exits.push({ id, code });
      },
    );
    hubs.push(hub);

    const info = hub.create({ cwd: tmpdir(), cols: 80, rows: 24, title: 'test-term' });
    expect(info.id).toBeTruthy();
    expect(info.title).toBe('test-term');
    expect(info.exited).toBe(false);
    expect(typeof info.ptyBacked).toBe('boolean');
    expect(hub.list()).toHaveLength(1);

    hub.resize(info.id, 100, 30);
    hub.write(info.id, 'echo SHANNON_PTY_TEST_OK\r');

    await waitForOutput(() => collected, 'SHANNON_PTY_TEST_OK');
    expect(hub.getBuffer(info.id)).toContain('SHANNON_PTY_TEST_OK');

    hub.kill(info.id);
    expect(hub.list()).toHaveLength(0);
  });
});
