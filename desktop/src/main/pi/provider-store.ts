import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import type {
  AvailableModelOption,
  ConnectionTestResult,
  ModelConfigItem,
  ProviderApiProtocol,
  ProviderEntry,
  RemoteModelFetchResult,
  SaveProviderInput,
} from '../../shared/types.js';

interface RawModelsJson {
  $schema?: string;
  providers?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

type RawAuthJson = Record<string, Record<string, unknown>>;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isObjectMap(value: unknown): value is Record<string, Record<string, unknown>> {
  return isObject(value) && Object.values(value).every(isObject);
}

function readProviderConfig<T>(
  path: string,
  isValid: (value: unknown) => value is T,
  forWrite: boolean,
): T | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    if (isValid(value)) return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
  }
  if (forWrite) throw new Error(`Cannot edit providers: ${basename(path)} is unreadable or invalid.`);
  return undefined;
}

function writeProviderConfig(path: string, data: RawModelsJson | RawAuthJson): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp.${randomUUID()}`;
  try {
    writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf-8', flag: 'wx', mode: 0o600 });
    renameSync(tmp, path);
  } finally {
    rmSync(tmp, { force: true });
  }
}

function isKeyReference(value: string): boolean {
  return value.startsWith('$') || value.startsWith('!');
}

function maskSecret(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (isKeyReference(value)) return value;
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export class ProviderStore {
  private readonly modelsPath: string;
  private readonly authPath: string;

  constructor(agentDir: string = getAgentDir()) {
    this.modelsPath = join(agentDir, 'models.json');
    this.authPath = join(agentDir, 'auth.json');
  }

  private readModelsJson(forWrite = false): RawModelsJson {
    return readProviderConfig(
      this.modelsPath,
      (value): value is RawModelsJson =>
        isObject(value) && (value.providers === undefined || isObjectMap(value.providers)),
      forWrite,
    ) ?? {};
  }

  private readAuthJson(forWrite = false): RawAuthJson {
    return readProviderConfig(this.authPath, isObjectMap, forWrite) ?? {};
  }

  listProviders(modelRuntime: ModelRuntime): ProviderEntry[] {
    const modelsJson = this.readModelsJson();
    const authJson = this.readAuthJson();
    const customProviders = modelsJson.providers ?? {};
    const runtimeModels = modelRuntime.getModels();
    const availableModels = modelRuntime.getAvailableSnapshot();

    const providerIds = new Set<string>();
    for (const m of runtimeModels) providerIds.add(m.provider);
    for (const id of Object.keys(customProviders)) providerIds.add(id);
    for (const id of Object.keys(authJson)) providerIds.add(id);

    const entries: ProviderEntry[] = [];
    for (const id of providerIds) {
      const runtimeProvider = modelRuntime.getProvider(id);
      const customRaw = customProviders[id];
      const authEntry = authJson[id];
      const modelsForProvider = runtimeModels.filter((m) => m.provider === id);
      const availableForProvider = availableModels.filter((m) => m.provider === id);

      const authStatus = modelRuntime.getProviderAuthStatus(id);
      const rawAuthKey =
        typeof authEntry?.key === 'string'
          ? authEntry.key
          : typeof authEntry?.apiKey === 'string'
            ? authEntry.apiKey
            : undefined;
      const rawModelJsonKey = typeof customRaw?.apiKey === 'string' ? customRaw.apiKey : undefined;
      const effectiveRawKey = rawAuthKey ?? rawModelJsonKey;

      let authMode: ProviderEntry['authMode'] = 'none';
      if (authEntry?.type === 'oauth') {
        authMode = 'oauth';
      } else if (rawAuthKey || rawModelJsonKey) {
        authMode = rawModelJsonKey?.startsWith('$') ? 'env' : 'api_key';
      } else if (authStatus.configured || modelRuntime.hasConfiguredAuth(id)) {
        authMode = 'env';
      }

      const customModelsRaw = Array.isArray(customRaw?.models)
        ? (customRaw.models as Array<Record<string, unknown>>)
        : [];
      const mergedModels: ModelConfigItem[] =
        modelsForProvider.length > 0
          ? modelsForProvider.map((m) => ({
              id: m.id,
              name: m.name || m.id,
              api: m.api,
              baseUrl: m.baseUrl,
              reasoning: Boolean(m.reasoning),
              input: (m.input as Array<'text' | 'image'>) ?? ['text'],
              contextWindow: m.contextWindow ?? 128000,
              maxTokens: m.maxTokens ?? 16384,
              cost: {
                input: m.cost?.input ?? 0,
                output: m.cost?.output ?? 0,
                cacheRead: m.cost?.cacheRead ?? 0,
                cacheWrite: m.cost?.cacheWrite ?? 0,
              },
            }))
          : customModelsRaw.map((m) => ({
              id: String(m.id ?? ''),
              name: String(m.name ?? m.id ?? ''),
              api: typeof m.api === 'string' ? m.api : undefined,
              baseUrl: typeof m.baseUrl === 'string' ? m.baseUrl : undefined,
              reasoning: Boolean(m.reasoning),
              input: Array.isArray(m.input) ? (m.input as Array<'text' | 'image'>) : ['text'],
              contextWindow: typeof m.contextWindow === 'number' ? m.contextWindow : 128000,
              maxTokens: typeof m.maxTokens === 'number' ? m.maxTokens : 16384,
              cost: {
                input: (m.cost as Record<string, number> | undefined)?.input ?? 0,
                output: (m.cost as Record<string, number> | undefined)?.output ?? 0,
                cacheRead: (m.cost as Record<string, number> | undefined)?.cacheRead ?? 0,
                cacheWrite: (m.cost as Record<string, number> | undefined)?.cacheWrite ?? 0,
              },
            }));

      const isBuiltin = Boolean(runtimeProvider) && !customRaw;
      const isCustom = Boolean(customRaw);

      entries.push({
        id,
        name:
          (typeof customRaw?.name === 'string' ? customRaw.name : undefined) ??
          runtimeProvider?.name ??
          id,
        isBuiltin,
        isCustom,
        hasAuth:
          modelRuntime.hasConfiguredAuth(id) ||
          Boolean(effectiveRawKey) ||
          availableForProvider.length > 0,
        authMode,
        maskedApiKey: maskSecret(effectiveRawKey),
        baseUrl:
          (typeof customRaw?.baseUrl === 'string' ? customRaw.baseUrl : undefined) ??
          modelsForProvider[0]?.baseUrl,
        api:
          (typeof customRaw?.api === 'string' ? customRaw.api : undefined) ??
          modelsForProvider[0]?.api,
        authHeader: typeof customRaw?.authHeader === 'boolean' ? customRaw.authHeader : undefined,
        headers:
          customRaw?.headers && typeof customRaw.headers === 'object'
            ? (customRaw.headers as Record<string, string>)
            : undefined,
        models: mergedModels,
        availableModelCount: availableForProvider.length,
      });
    }

    return entries.sort((a, b) => {
      if (a.isCustom !== b.isCustom) return a.isCustom ? -1 : 1;
      if (a.hasAuth !== b.hasAuth) return a.hasAuth ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  listAvailableModels(modelRuntime: ModelRuntime): AvailableModelOption[] {
    const available = modelRuntime.getAvailableSnapshot();
    const availableSet = new Set(available.map((m) => `${m.provider}::${m.id}`));
    const all = modelRuntime.getModels();
    const list = available.length > 0 ? available : all;

    return list.map((m) => {
      const provider = modelRuntime.getProvider(m.provider);
      return {
        provider: m.provider,
        providerName: provider?.name ?? m.provider,
        id: m.id,
        name: m.name || m.id,
        api: m.api,
        reasoning: Boolean(m.reasoning),
        input: (m.input as Array<'text' | 'image'>) ?? ['text'],
        contextWindow: m.contextWindow ?? 128000,
        maxTokens: m.maxTokens ?? 16384,
        hasAuth: availableSet.has(`${m.provider}::${m.id}`),
      };
    });
  }

  async saveProvider(input: SaveProviderInput, modelRuntime?: ModelRuntime): Promise<void> {
    const id = input.id.trim();
    if (!id) {
      throw new Error('Provider ID is required');
    }

    const modelsJson = this.readModelsJson(true);
    const authJson = this.readAuthJson(true);
    const providers = modelsJson.providers ??= {};

    const existingProvider = Object.hasOwn(providers, id) ? providers[id] : undefined;
    const updatedProvider: Record<string, unknown> = { ...existingProvider };

    if (input.name?.trim()) updatedProvider.name = input.name.trim();
    if (input.baseUrl?.trim()) updatedProvider.baseUrl = input.baseUrl.trim();
    else if (input.baseUrl === '') delete updatedProvider.baseUrl;

    if (input.api?.trim()) updatedProvider.api = input.api.trim();
    if (input.authHeader !== undefined) updatedProvider.authHeader = input.authHeader;

    if (input.headers && Object.keys(input.headers).length > 0) {
      updatedProvider.headers = input.headers;
    } else if (input.headers) {
      delete updatedProvider.headers;
    }

    if (input.models !== undefined) {
      if (input.models.length > 0) {
        updatedProvider.models = input.models.map((m) => ({
          id: m.id.trim(),
          name: m.name?.trim() || m.id.trim(),
          ...(m.api ? { api: m.api } : {}),
          ...(m.baseUrl ? { baseUrl: m.baseUrl } : {}),
          reasoning: Boolean(m.reasoning),
          input: m.input?.length ? m.input : ['text'],
          contextWindow: m.contextWindow || 128000,
          maxTokens: m.maxTokens || 16384,
          cost: m.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        }));
      } else {
        delete updatedProvider.models;
      }
    }

    const existingAuth = Object.hasOwn(authJson, id) ? authJson[id] : undefined;
    const key = input.apiKey?.trim();
    let removeAuth = false;
    if (input.clearApiKey) {
      removeAuth = Boolean(existingAuth);
      delete updatedProvider.apiKey;
    } else if (key && isKeyReference(key)) {
      updatedProvider.apiKey = key;
      removeAuth = existingAuth?.type === 'api_key';
    } else if (key) {
      const credential = existingAuth?.type === 'api_key' ? existingAuth : {};
      writeProviderConfig(this.authPath, {
        ...authJson,
        [id]: { ...credential, type: 'api_key', key },
      });
      delete updatedProvider.apiKey;
    } else if (
      typeof updatedProvider.apiKey === 'string' &&
      !isKeyReference(updatedProvider.apiKey) &&
      existingAuth?.type === 'api_key' &&
      existingAuth.key === updatedProvider.apiKey
    ) {
      // Remove a legacy duplicate when saving this provider. Distinct external credentials
      // are preserved unless the user explicitly changes or clears the key.
      delete updatedProvider.apiKey;
    }

    if (Object.keys(updatedProvider).length) {
      modelsJson.providers = { ...providers, [id]: updatedProvider };
      writeProviderConfig(this.modelsPath, modelsJson);
    } else if (existingProvider) {
      delete providers[id];
      writeProviderConfig(this.modelsPath, modelsJson);
    }
    if (removeAuth) {
      delete authJson[id];
      writeProviderConfig(this.authPath, authJson);
    }

    if (modelRuntime) {
      await modelRuntime.refresh({ allowNetwork: false });
    }
  }

  async deleteProvider(providerId: string, modelRuntime?: ModelRuntime): Promise<void> {
    const modelsJson = this.readModelsJson(true);
    const authJson = this.readAuthJson(true);
    if (modelsJson.providers && Object.hasOwn(modelsJson.providers, providerId)) {
      delete modelsJson.providers[providerId];
      writeProviderConfig(this.modelsPath, modelsJson);
    }

    if (Object.hasOwn(authJson, providerId)) {
      delete authJson[providerId];
      writeProviderConfig(this.authPath, authJson);
    }

    if (modelRuntime) {
      await modelRuntime.refresh({ allowNetwork: false });
    }
  }

  async fetchRemoteModels(params: {
    baseUrl: string;
    apiKey?: string;
    api: ProviderApiProtocol | string;
    headers?: Record<string, string>;
  }): Promise<RemoteModelFetchResult> {
    const base = params.baseUrl.replace(/\/+$/, '');
    if (!base) {
      return { ok: false, models: [], error: 'Base URL is required' };
    }

    const resolvedKey = params.apiKey?.startsWith('$')
      ? process.env[params.apiKey.slice(1)] ?? ''
      : params.apiKey ?? '';

    const headers: Record<string, string> = {
      ...(params.headers ?? {}),
    };

    let url = `${base}/models`;
    if (params.api === 'anthropic-messages') {
      if (resolvedKey) headers['x-api-key'] = resolvedKey;
      headers['anthropic-version'] = headers['anthropic-version'] ?? '2023-06-01';
    } else if (params.api === 'google-generative-ai') {
      url = resolvedKey ? `${base}/models?key=${encodeURIComponent(resolvedKey)}` : `${base}/models`;
    } else {
      if (resolvedKey) headers.Authorization = `Bearer ${resolvedKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return {
          ok: false,
          models: [],
          error: `HTTP ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 200)}` : ''}`,
        };
      }
      const json = (await res.json()) as Record<string, unknown>;
      const rawList = Array.isArray(json.data)
        ? (json.data as Array<Record<string, unknown>>)
        : Array.isArray(json.models)
          ? (json.models as Array<Record<string, unknown>>)
          : [];

      const models = rawList
        .map((item) => {
          const rawId = String(item.id ?? item.name ?? '');
          const cleanId = rawId.startsWith('models/') ? rawId.slice(7) : rawId;
          const displayName = typeof item.display_name === 'string'
            ? item.display_name
            : typeof item.displayName === 'string'
              ? item.displayName
              : cleanId;
          const contextWindow =
            typeof item.context_length === 'number'
              ? item.context_length
              : typeof item.inputTokenLimit === 'number'
                ? item.inputTokenLimit
                : undefined;
          const maxTokens =
            typeof item.max_output_tokens === 'number'
              ? item.max_output_tokens
              : typeof item.outputTokenLimit === 'number'
                ? item.outputTokenLimit
                : undefined;
          return {
            id: cleanId,
            name: displayName,
            contextWindow,
            maxTokens,
          };
        })
        .filter((m) => m.id.length > 0);

      return { ok: true, models };
    } catch (error) {
      return {
        ok: false,
        models: [],
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async testConnection(
    modelRuntime: ModelRuntime,
    providerId: string,
    modelId?: string,
  ): Promise<ConnectionTestResult> {
    const start = Date.now();
    const models = modelRuntime.getModels(providerId);
    const targetModel = modelId
      ? models.find((m) => m.id === modelId) ?? models[0]
      : models[0];

    if (!targetModel) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        message: `No model registered for provider "${providerId}". Add at least one model first.`,
      };
    }

    try {
      const response = await modelRuntime.complete(
        targetModel,
        {
          systemPrompt: 'Reply with OK.',
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'ping' }],
              timestamp: Date.now(),
            },
          ],
        },
        { maxTokens: 16 },
      );

      if (response.stopReason === 'error') {
        return {
          ok: false,
          latencyMs: Date.now() - start,
          message: response.errorMessage || 'Provider returned an error',
          modelUsed: targetModel.id,
        };
      }

      return {
        ok: true,
        latencyMs: Date.now() - start,
        message: `Connected (${targetModel.id})`,
        modelUsed: targetModel.id,
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : String(error),
        modelUsed: targetModel.id,
      };
    }
  }
}
