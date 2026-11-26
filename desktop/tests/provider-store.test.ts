import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it } from 'vitest';
import { ProviderStore } from '../src/main/pi/provider-store.js';

describe('ProviderStore', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('preserves existing CLI fields, enforces 0600 on auth.json, and loads into ModelRuntime', async () => {
    const agentDir = mkdtempSync(join(tmpdir(), 'shannon-agent-'));
    tempDirs.push(agentDir);

    const modelsPath = join(agentDir, 'models.json');
    const authPath = join(agentDir, 'auth.json');

    // Pre-populate unrelated CLI fields
    writeFileSync(
      modelsPath,
      JSON.stringify({
        $schema: 'https://pi.dev/schemas/models.schema.json',
        providers: {
          'existing-cli-provider': {
            name: 'Existing CLI',
            baseUrl: 'https://cli.example.com/v1',
            api: 'openai-completions',
            apiKey: '$CLI_ENV_KEY',
            models: [{ id: 'cli-model-1', name: 'CLI Model 1' }],
          },
        },
      }),
      'utf-8',
    );
    writeFileSync(
      authPath,
      JSON.stringify({
        anthropic: { type: 'api_key', key: 'sk-ant-existing' },
      }),
      { encoding: 'utf-8', mode: 0o600 },
    );

    const store = new ProviderStore(agentDir);
    const runtime = await ModelRuntime.create({
      authPath,
      modelsPath,
      allowModelNetwork: false,
    });

    await store.saveProvider(
      {
        id: 'my-proxy',
        name: 'My Proxy',
        baseUrl: 'https://proxy.local/v1',
        api: 'openai-completions',
        apiKey: 'sk-proxy-123456789',
        authHeader: true,
        models: [
          {
            id: 'deepseek-r1',
            name: 'DeepSeek R1',
            reasoning: true,
            input: ['text'],
            contextWindow: 64000,
            maxTokens: 8192,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          },
        ],
      },
      runtime,
    );

    const modelsRaw = JSON.parse(readFileSync(modelsPath, 'utf-8')) as {
      $schema?: string;
      providers: Record<string, { apiKey?: string }>;
    };
    expect(modelsRaw.$schema).toBe('https://pi.dev/schemas/models.schema.json');
    expect(modelsRaw.providers['existing-cli-provider'].apiKey).toBe('$CLI_ENV_KEY');
    expect(modelsRaw.providers['my-proxy'].apiKey).toBeUndefined();

    const authRaw = JSON.parse(readFileSync(authPath, 'utf-8')) as Record<string, { key?: string }>;
    expect(authRaw.anthropic.key).toBe('sk-ant-existing');
    expect(authRaw['my-proxy'].key).toBe('sk-proxy-123456789');

    if (process.platform !== 'win32') {
      const mode = statSync(authPath).mode & 0o777;
      expect(mode).toBe(0o600);
      expect(statSync(modelsPath).mode & 0o777).toBe(0o600);
    }

    const customModel = runtime.getModel('my-proxy', 'deepseek-r1');
    expect(customModel).toBeDefined();
    expect(customModel?.contextWindow).toBe(64000);
    expect(customModel?.reasoning).toBe(true);

    const providers = store.listProviders(runtime);
    const listedProxy = providers.find((p) => p.id === 'my-proxy');
    expect(listedProxy?.hasAuth).toBe(true);
    expect(listedProxy?.maskedApiKey).toBe('sk-p••••6789');
  });

  it('removes legacy duplicates on edit and clears a stale model key on explicit rotation', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shannon-agent-'));
    tempDirs.push(dir);
    const modelsPath = join(dir, 'models.json');
    const authPath = join(dir, 'auth.json');
    const store = new ProviderStore(dir);
    writeFileSync(modelsPath, JSON.stringify({
      providers: {
        duplicate: { apiKey: 'dummy-matching', baseUrl: 'http://localhost:1234/v1' },
        stale: { apiKey: 'dummy-stale', baseUrl: 'http://localhost:5678/v1' },
        external: { apiKey: 'dummy-external', baseUrl: 'http://localhost:9000/v1' },
      },
    }));
    writeFileSync(authPath, JSON.stringify({
      duplicate: { type: 'api_key', key: 'dummy-matching' },
      stale: { type: 'api_key', key: 'dummy-current' },
    }));

    await store.saveProvider({ id: 'duplicate', name: 'Edited provider' });
    await store.saveProvider({ id: 'stale', apiKey: 'dummy-new' });
    await store.saveProvider({ id: 'external', name: 'CC Switch provider' });

    const { providers } = JSON.parse(readFileSync(modelsPath, 'utf-8'));
    const credentials = JSON.parse(readFileSync(authPath, 'utf-8'));
    expect(providers.duplicate.apiKey).toBeUndefined();
    expect(providers.stale.apiKey).toBeUndefined();
    expect(providers.external.apiKey).toBe('dummy-external');
    expect(credentials.duplicate.key).toBe('dummy-matching');
    expect(credentials.stale.key).toBe('dummy-new');
  });

  it.each([
    ['models.json', '{"providers":'],
    ['auth.json', '[]'],
  ])('leaves both configuration files intact if %s cannot be safely read', async (invalidFile, invalidValue) => {
    const dir = mkdtempSync(join(tmpdir(), 'shannon-agent-'));
    tempDirs.push(dir);
    const store = new ProviderStore(dir);
    const modelsPath = join(dir, 'models.json');
    const authPath = join(dir, 'auth.json');
    const models = invalidFile === 'models.json' ? invalidValue : '{"providers":{"existing":{"name":"Existing"}}}';
    const auth = invalidFile === 'auth.json' ? invalidValue : '{"existing":{"type":"api_key","key":"dummy-key"}}';
    writeFileSync(modelsPath, models);
    writeFileSync(authPath, auth);

    await expect(store.saveProvider({ id: 'existing', apiKey: 'dummy-new' })).rejects.toThrow(invalidFile);
    await expect(store.deleteProvider('existing')).rejects.toThrow(invalidFile);
    expect(readFileSync(modelsPath, 'utf-8')).toBe(models);
    expect(readFileSync(authPath, 'utf-8')).toBe(auth);
  });
});
