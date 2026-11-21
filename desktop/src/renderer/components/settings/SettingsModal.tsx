import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import type {
  ConnectionTestResult,
  ModelConfigItem,
  ProviderApiProtocol,
  ProviderEntry,
} from '@shared/types';
import { useAppStore } from '../../stores/app-store.js';

interface ProviderTemplate {
  key: string;
  label: string;
  id: string;
  name: string;
  api: ProviderApiProtocol;
  baseUrl: string;
  apiKeyHint: string;
  authHeader: boolean;
  defaultModels: ModelConfigItem[];
}

const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    key: 'custom-openai',
    label: 'Custom OpenAI-Compatible Proxy',
    id: 'custom-openai',
    name: 'OpenAI-Compatible Proxy',
    api: 'openai-completions',
    baseUrl: 'https://api.example.com/v1',
    apiKeyHint: 'sk-...',
    authHeader: true,
    defaultModels: [
      {
        id: 'gpt-4o',
        name: 'gpt-4o',
        reasoning: false,
        input: ['text', 'image'],
        contextWindow: 128000,
        maxTokens: 16384,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
  },
  {
    key: 'custom-anthropic',
    label: 'Custom Anthropic-Compatible Proxy',
    id: 'custom-anthropic',
    name: 'Anthropic-Compatible Proxy',
    api: 'anthropic-messages',
    baseUrl: 'https://api.example.com',
    apiKeyHint: 'sk-ant-...',
    authHeader: false,
    defaultModels: [
      {
        id: 'claude-sonnet-4-5',
        name: 'Claude Sonnet 4.5',
        reasoning: true,
        input: ['text', 'image'],
        contextWindow: 200000,
        maxTokens: 16384,
        cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      },
    ],
  },
  {
    key: 'ollama',
    label: 'Ollama (Local)',
    id: 'ollama',
    name: 'Ollama',
    api: 'openai-completions',
    baseUrl: 'http://localhost:11434/v1',
    apiKeyHint: 'ollama (optional)',
    authHeader: false,
    defaultModels: [
      {
        id: 'qwen3:8b',
        name: 'Qwen 3 8B',
        reasoning: true,
        input: ['text'],
        contextWindow: 32768,
        maxTokens: 8192,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
  },
  {
    key: 'lmstudio',
    label: 'LM Studio (Local)',
    id: 'lmstudio',
    name: 'LM Studio',
    api: 'openai-completions',
    baseUrl: 'http://localhost:1234/v1',
    apiKeyHint: 'lm-studio',
    authHeader: false,
    defaultModels: [],
  },
  {
    key: 'anthropic',
    label: 'Anthropic (Official)',
    id: 'anthropic',
    name: 'Anthropic',
    api: 'anthropic-messages',
    baseUrl: '',
    apiKeyHint: 'sk-ant-... or $ANTHROPIC_API_KEY',
    authHeader: false,
    defaultModels: [],
  },
  {
    key: 'openai',
    label: 'OpenAI (Official)',
    id: 'openai',
    name: 'OpenAI',
    api: 'openai-responses',
    baseUrl: '',
    apiKeyHint: 'sk-... or $OPENAI_API_KEY',
    authHeader: true,
    defaultModels: [],
  },
  {
    key: 'google',
    label: 'Google Gemini',
    id: 'google',
    name: 'Google Gemini',
    api: 'google-generative-ai',
    baseUrl: '',
    apiKeyHint: 'AIza... or $GEMINI_API_KEY',
    authHeader: false,
    defaultModels: [],
  },
  {
    key: 'openrouter',
    label: 'OpenRouter',
    id: 'openrouter',
    name: 'OpenRouter',
    api: 'openai-completions',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyHint: 'sk-or-... or $OPENROUTER_API_KEY',
    authHeader: true,
    defaultModels: [],
  },
  {
    key: 'deepseek',
    label: 'DeepSeek',
    id: 'deepseek',
    name: 'DeepSeek',
    api: 'openai-completions',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyHint: 'sk-... or $DEEPSEEK_API_KEY',
    authHeader: true,
    defaultModels: [],
  },
];

export const SettingsModal: React.FC = () => {
  const {
    settingsOpen,
    setSettingsOpen,
    providers,
    agentDir,
    refreshProviders,
    pushToast,
  } = useAppStore();

  const [selectedId, setSelectedId] = useState<string>('');
  const [creatingNew, setCreatingNew] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');

  // Form state
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [api, setApi] = useState<ProviderApiProtocol | string>('openai-completions');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [authHeader, setAuthHeader] = useState(true);
  const [headersRows, setHeadersRows] = useState<Array<{ key: string; value: string }>>([]);
  const [models, setModels] = useState<ModelConfigItem[]>([]);

  const [saving, setSaving] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  const loadProviderIntoForm = (p: ProviderEntry) => {
    setCreatingNew(false);
    setSelectedId(p.id);
    setId(p.id);
    setName(p.name);
    setApi(p.api ?? 'openai-completions');
    setBaseUrl(p.baseUrl ?? '');
    setApiKey('');
    setAuthHeader(p.authHeader ?? true);
    setHeadersRows(
      p.headers
        ? Object.entries(p.headers).map(([key, value]) => ({ key, value }))
        : [],
    );
    setModels(p.isCustom ? p.models : []);
    setTestResult(null);
  };

  useEffect(() => {
    if (!settingsOpen) return;
    if (!selectedId && !creatingNew && providers.length > 0) {
      const preferred =
        providers.find((p) => p.isCustom || p.hasAuth) ?? providers[0];
      loadProviderIntoForm(preferred);
    }
  }, [settingsOpen, providers, selectedId, creatingNew]);

  const filteredProviders = useMemo(() => {
    const q = providerSearch.trim().toLowerCase();
    return providers.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q),
    );
  }, [providers, providerSearch]);

  if (!settingsOpen) return null;

  const currentProvider = providers.find((p) => p.id === selectedId);

  const applyTemplate = (tpl: ProviderTemplate) => {
    setCreatingNew(true);
    setSelectedId('');
    setId(tpl.id);
    setName(tpl.name);
    setApi(tpl.api);
    setBaseUrl(tpl.baseUrl);
    setApiKey('');
    setAuthHeader(tpl.authHeader);
    setHeadersRows([]);
    setModels(tpl.defaultModels);
    setTestResult(null);
  };

  const buildHeadersMap = (): Record<string, string> | undefined => {
    const map: Record<string, string> = {};
    for (const row of headersRows) {
      if (row.key.trim()) {
        map[row.key.trim()] = row.value;
      }
    }
    return Object.keys(map).length > 0 ? map : undefined;
  };

  const handleSave = async () => {
    if (!id.trim()) {
      pushToast('error', 'Provider ID is required');
      return;
    }
    setSaving(true);
    try {
      await window.shannon.saveProvider({
        id: id.trim(),
        name: name.trim() || id.trim(),
        api,
        baseUrl: baseUrl.trim(),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        authHeader,
        headers: buildHeadersMap(),
        models: models.length > 0 || creatingNew || currentProvider?.isCustom ? models : undefined,
      });
      await refreshProviders();
      setCreatingNew(false);
      setSelectedId(id.trim());
      setApiKey('');
      pushToast('info', `Saved provider "${name.trim() || id.trim()}"`);
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const handleFetchRemoteModels = async () => {
    const effectiveBase = baseUrl.trim();
    if (!effectiveBase) {
      pushToast('warning', 'Enter a Base URL first to fetch models');
      return;
    }
    setFetchingModels(true);
    try {
      const res = await window.shannon.fetchRemoteModels({
        baseUrl: effectiveBase,
        apiKey: apiKey.trim() || undefined,
        api,
        headers: buildHeadersMap(),
      });
      if (!res.ok) {
        pushToast('error', res.error || 'Failed to fetch /models');
        return;
      }
      if (res.models.length === 0) {
        pushToast('warning', 'Endpoint returned 0 models');
        return;
      }
      const existingIds = new Set(models.map((m) => m.id));
      const added: ModelConfigItem[] = res.models
        .filter((m) => !existingIds.has(m.id))
        .map((m) => ({
          id: m.id,
          name: m.name || m.id,
          reasoning: /reason|r1|thinking|o1|o3|o4|claude|gemini-2\.5|gemini-3/i.test(m.id),
          input: ['text'],
          contextWindow: m.contextWindow ?? 128000,
          maxTokens: m.maxTokens ?? 16384,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        }));
      setModels((prev) => [...prev, ...added]);
      pushToast('info', `Imported ${added.length} model(s) (${res.models.length} total)`);
    } finally {
      setFetchingModels(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Save current edits first if provider ID exists
      if (id.trim() && (apiKey.trim() || baseUrl.trim() || models.length > 0)) {
        await window.shannon.saveProvider({
          id: id.trim(),
          name: name.trim() || id.trim(),
          api,
          baseUrl: baseUrl.trim(),
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          authHeader,
          headers: buildHeadersMap(),
          models: models.length > 0 ? models : undefined,
        });
        await refreshProviders();
      }
      const res = await window.shannon.testConnection({
        providerId: id.trim(),
        modelId: models[0]?.id,
      });
      setTestResult(res);
    } catch (error) {
      setTestResult({
        ok: false,
        latencyMs: 0,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async (targetId: string) => {
    await window.shannon.deleteProvider(targetId);
    await refreshProviders();
    setSelectedId('');
    setCreatingNew(false);
    pushToast('info', `Removed custom configuration for ${targetId}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px] p-4">
      <div className="flex h-[82vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] shadow-[var(--shadow-popover)]">
        {/* Left Navigation */}
        <div className="flex w-64 shrink-0 flex-col border-r border-[var(--border-hairline)] bg-[var(--bg-sidebar)]">
          <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-4 py-3">
            <span className="text-[14px] font-semibold text-[var(--text-primary)]">
              API &amp; Models
            </span>
            <button
              type="button"
              onClick={() => applyTemplate(PROVIDER_TEMPLATES[0])}
              className="flex items-center gap-1 rounded-md bg-[var(--accent)] px-2 py-1 text-[11.5px] font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>

          <div className="p-2.5 border-b border-[var(--border-hairline)]">
            <input
              value={providerSearch}
              onChange={(e) => setProviderSearch(e.target.value)}
              placeholder="Filter providers…"
              className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[12px] text-[var(--text-primary)] outline-none"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-3">
            {/* Quick Templates */}
            <div>
              <div className="px-2 pb-1 text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Quick Setup Templates
              </div>
              <div className="space-y-0.5">
                {PROVIDER_TEMPLATES.slice(0, 4).map((tpl) => (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <Plus className="w-3 h-3 text-[var(--accent)] shrink-0" />
                    <span className="truncate">{tpl.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* All Providers */}
            <div>
              <div className="px-2 pb-1 text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Providers ({filteredProviders.length})
              </div>
              <div className="space-y-0.5">
                {filteredProviders.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => loadProviderIntoForm(p)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] cursor-pointer ${
                      !creatingNew && selectedId === p.id
                        ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-medium shadow-xs'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          p.hasAuth ? 'bg-emerald-500' : 'bg-[var(--border-strong)]'
                        }`}
                      />
                      <span className="truncate">{p.name}</span>
                    </span>
                    {p.isCustom && (
                      <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.2 text-[10px] text-[var(--accent)]">
                        custom
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--border-hairline)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
            Shared with Pi CLI: <code className="font-mono">{agentDir || '~/.pi/agent'}</code>
          </div>
        </div>

        {/* Right Editor */}
        <div className="flex flex-1 flex-col min-w-0">
          <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-6 py-3.5">
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                {creatingNew ? 'Add Custom Provider' : currentProvider?.name || 'Provider Configuration'}
              </h2>
              <p className="text-[12px] text-[var(--text-secondary)]">
                Writes directly to Pi&apos;s <code className="font-mono">models.json</code> &amp;{' '}
                <code className="font-mono">auth.json</code> and hot-reloads active models.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-5 text-[13px]">
            {/* Basic Identity & Protocol */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block mb-1 text-[11.5px] font-medium text-[var(--text-secondary)]">
                  Provider ID
                </label>
                <input
                  value={id}
                  disabled={!creatingNew && Boolean(currentProvider?.isBuiltin)}
                  onChange={(e) => setId(e.target.value)}
                  placeholder="e.g. my-proxy"
                  className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 font-mono text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)] disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block mb-1 text-[11.5px] font-medium text-[var(--text-secondary)]">
                  Display Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Proxy / Ollama"
                  className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]"
                />
              </div>
              <div>
                <label className="block mb-1 text-[11.5px] font-medium text-[var(--text-secondary)]">
                  API Protocol
                </label>
                <select
                  value={api}
                  onChange={(e) => setApi(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]"
                >
                  <option value="openai-completions">openai-completions</option>
                  <option value="openai-responses">openai-responses</option>
                  <option value="anthropic-messages">anthropic-messages</option>
                  <option value="google-generative-ai">google-generative-ai</option>
                </select>
              </div>
            </div>

            {/* Base URL & API Key */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block mb-1 text-[11.5px] font-medium text-[var(--text-secondary)]">
                  Base URL (leave empty for official default)
                </label>
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1 or http://localhost:11434/v1"
                  className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 font-mono text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]"
                />
              </div>
              <div>
                <label className="block mb-1 text-[11.5px] font-medium text-[var(--text-secondary)]">
                  API Key{' '}
                  {currentProvider?.maskedApiKey && (
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">
                      (Current: {currentProvider.maskedApiKey})
                    </span>
                  )}
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={
                      currentProvider?.hasAuth
                        ? 'Enter new key to replace, or leave blank'
                        : 'sk-... or $ENV_VAR_NAME'
                    }
                    className="flex-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 font-mono text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-[12.5px] text-[var(--text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={authHeader}
                  onChange={(e) => setAuthHeader(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                Send API key as <code className="font-mono">Authorization: Bearer</code> header
              </label>
            </div>

            {/* Custom Headers */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-medium text-[var(--text-secondary)]">
                  Custom Headers (optional)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setHeadersRows((prev) => [...prev, { key: '', value: '' }])
                  }
                  className="text-[11.5px] text-[var(--accent)] hover:underline cursor-pointer"
                >
                  + Add Header
                </button>
              </div>
              {headersRows.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    value={row.key}
                    onChange={(e) =>
                      setHeadersRows((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, key: e.target.value } : r)),
                      )
                    }
                    placeholder="Header Name"
                    className="w-1/3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 font-mono text-[12px] text-[var(--text-primary)] outline-none"
                  />
                  <input
                    value={row.value}
                    onChange={(e) =>
                      setHeadersRows((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r)),
                      )
                    }
                    placeholder="Value or $ENV_VAR"
                    className="flex-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 font-mono text-[12px] text-[var(--text-primary)] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setHeadersRows((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="p-1 text-[var(--text-muted)] hover:text-red-500 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Custom Models Editor */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-[var(--text-primary)]">
                  Custom Models ({models.length})
                  {!creatingNew && currentProvider?.isBuiltin && (
                    <span className="ml-2 text-[11px] font-normal text-[var(--text-muted)]">
                      Built-in provider already ships {currentProvider.models.length} models
                    </span>
                  )}
                </span>

                <div className="flex items-center gap-2">
                  {baseUrl.trim() && (
                    <button
                      type="button"
                      disabled={fetchingModels}
                      onClick={() => void handleFetchRemoteModels()}
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-[12px] text-[var(--text-primary)] hover:border-[var(--border-strong)] cursor-pointer"
                    >
                      {fetchingModels ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Fetch /models
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setModels((prev) => [
                        ...prev,
                        {
                          id: '',
                          name: '',
                          reasoning: false,
                          input: ['text'],
                          contextWindow: 128000,
                          maxTokens: 16384,
                          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                        },
                      ])
                    }
                    className="flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-[12px] text-[var(--text-primary)] hover:border-[var(--border-strong)] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Model
                  </button>
                </div>
              </div>

              {models.length > 0 && (
                <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] overflow-hidden">
                  <div className="divide-y divide-[var(--border-hairline)] max-h-60 overflow-y-auto">
                    {models.map((m, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-[12px]"
                      >
                        <input
                          value={m.id}
                          onChange={(e) =>
                            setModels((prev) =>
                              prev.map((item, i) =>
                                i === idx
                                  ? { ...item, id: e.target.value, name: item.name || e.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder="model-id"
                          className="col-span-4 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2 py-1 font-mono text-[11.5px] outline-none"
                        />
                        <input
                          value={m.name}
                          onChange={(e) =>
                            setModels((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, name: e.target.value } : item,
                              ),
                            )
                          }
                          placeholder="Display name"
                          className="col-span-3 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2 py-1 text-[11.5px] outline-none"
                        />
                        <input
                          type="number"
                          value={m.contextWindow}
                          onChange={(e) =>
                            setModels((prev) =>
                              prev.map((item, i) =>
                                i === idx
                                  ? { ...item, contextWindow: Number(e.target.value) || 128000 }
                                  : item,
                              ),
                            )
                          }
                          title="Context Window"
                          className="col-span-2 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2 py-1 font-mono text-[11.5px] outline-none"
                        />
                        <label className="col-span-2 flex items-center gap-1 text-[11px] text-[var(--text-secondary)] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={m.reasoning}
                            onChange={(e) =>
                              setModels((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, reasoning: e.target.checked } : item,
                                ),
                              )
                            }
                            className="accent-[var(--accent)]"
                          />
                          Think
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setModels((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="col-span-1 flex justify-end text-[var(--text-muted)] hover:text-red-500 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Test Connection Banner */}
            {testResult && (
              <div
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px] ${
                  testResult.ok
                    ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-300'
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0" />
                )}
                <span className="flex-1">{testResult.message}</span>
                <span className="font-mono text-[11px] opacity-80">{testResult.latencyMs}ms</span>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between border-t border-[var(--border-hairline)] bg-[var(--bg-sidebar)] px-6 py-3">
            <div className="flex items-center gap-2">
              {!creatingNew && currentProvider && (currentProvider.isCustom || currentProvider.hasAuth) && (
                <button
                  type="button"
                  onClick={() => void handleDelete(currentProvider.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-[12.5px] text-red-600 dark:text-red-400 hover:bg-red-500/10 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove Config
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={testing || !id.trim()}
                onClick={() => void handleTestConnection()}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-1.5 text-[12.5px] font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] disabled:opacity-45 cursor-pointer"
              >
                {testing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5 text-[var(--accent)]" />
                )}
                Test Connection
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-1.5 text-[12.5px] font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-45 cursor-pointer"
              >
                <Server className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : 'Save & Apply'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
