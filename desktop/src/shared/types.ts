export type ThemeMode = 'light' | 'dark' | 'system';

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ModelRef {
  provider: string;
  modelId: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  pinned: boolean;
  addedAt: string;
  lastOpenedAt: string;
  gitBranch?: string;
  defaultModel?: ModelRef;
  defaultThinkingLevel?: ThinkingLevel;
}

export interface SessionSummary {
  id: string;
  path: string;
  cwd: string;
  projectId?: string;
  name: string;
  firstMessage: string;
  messageCount: number;
  created: string;
  modified: string;
  isRunning: boolean;
  isStreaming: boolean;
  hasActiveBash: boolean;
  needsInput?: boolean;
  lastError?: string;
  archived?: boolean;
}

export interface ImageAttachment {
  type: 'image';
  data: string;
  mimeType: string;
}

export type UiMessageBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | {
      type: 'toolCall';
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }
  | { type: 'image'; data: string; mimeType: string };

export interface UiToolResultDetail {
  toolCallId: string;
  toolName: string;
  text: string;
  images?: ImageAttachment[];
  isError: boolean;
  details?: Record<string, unknown>;
  timestamp: number;
}

export interface UiMessage {
  id: string;
  entryId?: string;
  role:
    | 'user'
    | 'assistant'
    | 'toolResult'
    | 'bashExecution'
    | 'compactionSummary'
    | 'branchSummary'
    | 'custom';
  timestamp: number;
  // User & custom & summaries
  text?: string;
  images?: ImageAttachment[];
  // Assistant
  blocks?: UiMessageBlock[];
  model?: string;
  provider?: string;
  stopReason?: string;
  errorMessage?: string;
  usage?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    cost: number;
  };
  // Tool result
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  details?: Record<string, unknown>;
  // Bash execution (! / !!)
  bash?: {
    command: string;
    output: string;
    exitCode?: number;
    cancelled: boolean;
    truncated: boolean;
    fullOutputPath?: string;
    excludeFromContext: boolean;
  };
  // Compaction / branch summary
  tokensBefore?: number;
  summary?: string;
  customType?: string;
}

export type ContextCategoryKey =
  | 'system_prompt'
  | 'project_instructions'
  | 'skills'
  | 'tools_builtin'
  | 'tools_mcp'
  | 'tools_extension'
  | 'compaction_summary'
  | 'user_messages'
  | 'assistant_messages'
  | 'tool_results'
  | 'bash_in_context';

export interface ContextCategoryDetailItem {
  label: string;
  sublabel?: string;
  tokens: number;
  entryId?: string;
}

export interface ContextCategory {
  key: ContextCategoryKey;
  label: string;
  estimatedTokens: number;
  calibratedTokens: number;
  percent: number;
  itemCount: number;
  details?: ContextCategoryDetailItem[];
}

export interface ContextTopItem {
  label: string;
  category: ContextCategoryKey;
  tokens: number;
  entryId?: string;
}

export interface ContextBreakdown {
  totalTokens: number | null;
  isApiMeasured: boolean;
  estimatedTotalTokens: number;
  contextWindow: number;
  percent: number | null;
  remainingTokens: number | null;
  categories: ContextCategory[];
  excludedBashCount: number;
  topItems: ContextTopItem[];
  systemPromptPreview?: string;
  sessionStats: {
    userMessages: number;
    assistantMessages: number;
    toolCalls: number;
    toolResults: number;
    totalMessages: number;
    tokens: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      total: number;
    };
    cost: number;
  };
}

export interface SessionTreeItem {
  id: string;
  parentId: string | null;
  type: string;
  role?: string;
  preview: string;
  timestamp: string;
  isActiveLeaf: boolean;
  isOnActiveBranch: boolean;
  children: SessionTreeItem[];
}

export interface SlashCommandItem {
  name: string;
  description?: string;
  source: 'builtin' | 'extension' | 'prompt' | 'skill';
  argsHint?: string;
}

export interface ProjectResourcesInfo {
  cwd: string;
  agentsFiles: Array<{ path: string; bytes: number; tokens: number }>;
  skills: Array<{ name: string; description: string; filePath: string; source: string }>;
  prompts: Array<{ name: string; description?: string; source: string }>;
  commands: SlashCommandItem[];
  tools: Array<{
    name: string;
    description: string;
    source: 'builtin' | 'mcp' | 'extension';
    mcpServer?: string;
    active: boolean;
  }>;
}

export type ProviderApiProtocol =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic-messages'
  | 'google-generative-ai';

export interface ModelConfigItem {
  id: string;
  name: string;
  api?: ProviderApiProtocol | string;
  baseUrl?: string;
  reasoning: boolean;
  input: Array<'text' | 'image'>;
  contextWindow: number;
  maxTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

export interface ProviderEntry {
  id: string;
  name: string;
  isBuiltin: boolean;
  isCustom: boolean;
  hasAuth: boolean;
  authMode?: 'api_key' | 'oauth' | 'env' | 'none';
  maskedApiKey?: string;
  rawApiKey?: string;
  baseUrl?: string;
  api?: ProviderApiProtocol | string;
  authHeader?: boolean;
  headers?: Record<string, string>;
  models: ModelConfigItem[];
  availableModelCount: number;
}

export interface SaveProviderInput {
  id: string;
  name?: string;
  baseUrl?: string;
  api?: ProviderApiProtocol | string;
  apiKey?: string;
  clearApiKey?: boolean;
  authHeader?: boolean;
  headers?: Record<string, string>;
  models?: ModelConfigItem[];
}

export interface RemoteModelFetchResult {
  ok: boolean;
  models: Array<{
    id: string;
    name?: string;
    contextWindow?: number;
    maxTokens?: number;
    reasoning?: boolean;
  }>;
  error?: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
  modelUsed?: string;
}

export interface AvailableModelOption {
  provider: string;
  providerName: string;
  id: string;
  name: string;
  api: string;
  reasoning: boolean;
  input: Array<'text' | 'image'>;
  contextWindow: number;
  maxTokens: number;
  hasAuth: boolean;
}

export interface ActiveSessionSnapshot {
  sessionId: string;
  sessionFile?: string;
  cwd: string;
  projectId?: string;
  name: string;
  isStreaming: boolean;
  isBashRunning: boolean;
  isCompacting: boolean;
  model?: AvailableModelOption;
  thinkingLevel: ThinkingLevel;
  availableThinkingLevels: ThinkingLevel[];
  messages: UiMessage[];
  contextBreakdown: ContextBreakdown;
  tree: SessionTreeItem[];
  resources: ProjectResourcesInfo;
  queuedSteerCount: number;
  queuedFollowUpCount: number;
}

export interface WorkspaceFileMatch {
  relativePath: string;
  name: string;
  isDirectory: boolean;
}

export type StreamEvent =
  | {
      type: 'assistant_delta';
      sessionId: string;
      messageId: string;
      textDelta?: string;
      thinkingDelta?: string;
      toolCall?: { id: string; name: string; arguments: Record<string, unknown> };
    }
  | {
      type: 'message_committed';
      sessionId: string;
      message: UiMessage;
    }
  | {
      type: 'tool_execution';
      sessionId: string;
      phase: 'start' | 'update' | 'end';
      toolCallId: string;
      toolName: string;
      args?: Record<string, unknown>;
      partialText?: string;
      resultText?: string;
      isError?: boolean;
      details?: Record<string, unknown>;
    }
  | {
      type: 'bash_update';
      sessionId: string;
      runId: string;
      command: string;
      excludeFromContext: boolean;
      chunk?: string;
      done?: boolean;
      exitCode?: number;
      cancelled?: boolean;
      truncated?: boolean;
      fullOutputPath?: string;
    }
  | {
      type: 'session_status';
      sessionId: string;
      isStreaming: boolean;
      isBashRunning: boolean;
      isCompacting: boolean;
      model?: AvailableModelOption;
      thinkingLevel?: ThinkingLevel;
      availableThinkingLevels?: ThinkingLevel[];
      error?: string;
    }
  | {
      type: 'context_updated';
      sessionId: string;
      contextBreakdown: ContextBreakdown;
    }
  | {
      type: 'sessions_list_changed';
    }
  | {
      type: 'session_reloaded';
      sessionId: string;
      snapshot: ActiveSessionSnapshot;
    }
  | {
      type: 'ui_notification';
      sessionId?: string;
      level: 'info' | 'warning' | 'error';
      message: string;
    };

export interface ShannonAppConfig {
  theme: ThemeMode;
  sidebarCollapsed: boolean;
  agentDir: string;
}
