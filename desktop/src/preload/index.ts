import { contextBridge, ipcRenderer } from 'electron';
import type {
  ActiveSessionSnapshot,
  AvailableModelOption,
  ConnectionTestResult,
  ContextBreakdown,
  ImageAttachment,
  ProjectRecord,
  ProviderApiProtocol,
  ProviderEntry,
  RemoteModelFetchResult,
  SaveProviderInput,
  SessionSummary,
  SessionTreeItem,
  ShannonAppConfig,
  StreamEvent,
  TerminalInfo,
  ThemeMode,
  ThinkingLevel,
  WorkspaceFileMatch,
} from '../shared/types.js';

export interface ShannonApi {
  // App & Config
  getAppConfig: () => Promise<ShannonAppConfig>;
  setTheme: (theme: ThemeMode) => Promise<void>;
  setSidebarCollapsed: (collapsed: boolean) => Promise<void>;
  pickDirectory: () => Promise<string | null>;
  openPath: (targetPath: string) => Promise<void>;
  revealInFinder: (targetPath: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;

  // Projects
  listProjects: () => Promise<ProjectRecord[]>;
  addProject: (dirPath?: string) => Promise<ProjectRecord | null>;
  removeProject: (projectId: string) => Promise<void>;
  updateProject: (
    projectId: string,
    patch: Partial<Pick<ProjectRecord, 'name' | 'pinned' | 'defaultModel' | 'defaultThinkingLevel'>>,
  ) => Promise<ProjectRecord>;

  // Sessions
  listSessions: () => Promise<SessionSummary[]>;
  createSession: (options?: { cwd?: string; projectId?: string }) => Promise<ActiveSessionSnapshot>;
  openSession: (sessionPath: string) => Promise<ActiveSessionSnapshot>;
  deleteSession: (sessionPath: string) => Promise<void>;
  archiveSession: (sessionPath: string) => Promise<void>;
  unarchiveSession: (sessionPath: string) => Promise<void>;
  setSessionName: (sessionId: string, name: string) => Promise<void>;
  exportSessionHtml: (sessionId: string) => Promise<{ path: string }>;

  // Chat & Execution
  prompt: (
    sessionId: string,
    message: string,
    options?: {
      images?: ImageAttachment[];
      streamingBehavior?: 'steer' | 'followUp';
    },
  ) => Promise<{ disposition: 'started' | 'queued' | 'handled' }>;
  abort: (sessionId: string) => Promise<void>;
  executeBash: (
    sessionId: string,
    command: string,
    excludeFromContext: boolean,
  ) => Promise<{
    runId: string;
    output: string;
    exitCode?: number;
    cancelled: boolean;
    truncated: boolean;
    fullOutputPath?: string;
  }>;
  abortBash: (sessionId: string) => Promise<void>;
  setModel: (sessionId: string, provider: string, modelId: string) => Promise<ActiveSessionSnapshot>;
  setThinkingLevel: (sessionId: string, level: ThinkingLevel) => Promise<ActiveSessionSnapshot>;

  // Context & Tree
  getContextBreakdown: (sessionId: string) => Promise<ContextBreakdown>;
  compactSession: (sessionId: string, customInstructions?: string) => Promise<ActiveSessionSnapshot>;
  reloadSession: (sessionId: string) => Promise<ActiveSessionSnapshot>;
  getSessionTree: (sessionId: string) => Promise<SessionTreeItem[]>;
  navigateTree: (
    sessionId: string,
    targetId: string,
    summarize?: boolean,
  ) => Promise<ActiveSessionSnapshot>;
  forkSession: (sessionId: string, entryId: string) => Promise<ActiveSessionSnapshot>;
  listWorkspaceFiles: (cwd: string, query: string) => Promise<WorkspaceFileMatch[]>;

  // Providers & Models
  listProviders: () => Promise<ProviderEntry[]>;
  listAvailableModels: () => Promise<AvailableModelOption[]>;
  saveProvider: (input: SaveProviderInput) => Promise<ProviderEntry[]>;
  deleteProvider: (providerId: string) => Promise<ProviderEntry[]>;
  fetchRemoteModels: (params: {
    baseUrl: string;
    apiKey?: string;
    api: ProviderApiProtocol | string;
    headers?: Record<string, string>;
  }) => Promise<RemoteModelFetchResult>;
  testConnection: (params: {
    providerId: string;
    modelId?: string;
  }) => Promise<ConnectionTestResult>;

  // Integrated Terminals
  listTerminals: () => Promise<TerminalInfo[]>;
  createTerminal: (options?: {
    cwd?: string;
    cols?: number;
    rows?: number;
    title?: string;
  }) => Promise<TerminalInfo>;
  writeTerminal: (terminalId: string, data: string) => void;
  resizeTerminal: (terminalId: string, cols: number, rows: number) => void;
  killTerminal: (terminalId: string) => Promise<void>;
  getTerminalBuffer: (terminalId: string) => Promise<string>;
  onTerminalData: (listener: (payload: { terminalId: string; data: string }) => void) => () => void;
  onTerminalExit: (
    listener: (payload: { terminalId: string; exitCode: number | null }) => void,
  ) => () => void;

  // Events
  onEvent: (listener: (event: StreamEvent) => void) => () => void;
}

const api: ShannonApi = {
  getAppConfig: () => ipcRenderer.invoke('app:getConfig'),
  setTheme: (theme) => ipcRenderer.invoke('app:setTheme', theme),
  setSidebarCollapsed: (collapsed) => ipcRenderer.invoke('app:setSidebarCollapsed', collapsed),
  pickDirectory: () => ipcRenderer.invoke('app:pickDirectory'),
  openPath: (targetPath) => ipcRenderer.invoke('app:openPath', targetPath),
  revealInFinder: (targetPath) => ipcRenderer.invoke('app:revealInFinder', targetPath),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),

  listProjects: () => ipcRenderer.invoke('projects:list'),
  addProject: (dirPath) => ipcRenderer.invoke('projects:add', dirPath),
  removeProject: (projectId) => ipcRenderer.invoke('projects:remove', projectId),
  updateProject: (projectId, patch) => ipcRenderer.invoke('projects:update', projectId, patch),

  listSessions: () => ipcRenderer.invoke('sessions:list'),
  createSession: (options) => ipcRenderer.invoke('sessions:create', options),
  openSession: (sessionPath) => ipcRenderer.invoke('sessions:open', sessionPath),
  deleteSession: (sessionPath) => ipcRenderer.invoke('sessions:delete', sessionPath),
  archiveSession: (sessionPath) => ipcRenderer.invoke('sessions:archive', sessionPath),
  unarchiveSession: (sessionPath) => ipcRenderer.invoke('sessions:unarchive', sessionPath),
  setSessionName: (sessionId, name) => ipcRenderer.invoke('sessions:setName', sessionId, name),
  exportSessionHtml: (sessionId) => ipcRenderer.invoke('sessions:exportHtml', sessionId),

  prompt: (sessionId, message, options) =>
    ipcRenderer.invoke('sessions:prompt', sessionId, message, options),
  abort: (sessionId) => ipcRenderer.invoke('sessions:abort', sessionId),
  executeBash: (sessionId, command, excludeFromContext) =>
    ipcRenderer.invoke('sessions:executeBash', sessionId, command, excludeFromContext),
  abortBash: (sessionId) => ipcRenderer.invoke('sessions:abortBash', sessionId),
  setModel: (sessionId, provider, modelId) =>
    ipcRenderer.invoke('sessions:setModel', sessionId, provider, modelId),
  setThinkingLevel: (sessionId, level) =>
    ipcRenderer.invoke('sessions:setThinkingLevel', sessionId, level),

  getContextBreakdown: (sessionId) => ipcRenderer.invoke('sessions:getContextBreakdown', sessionId),
  compactSession: (sessionId, customInstructions) =>
    ipcRenderer.invoke('sessions:compact', sessionId, customInstructions),
  reloadSession: (sessionId) => ipcRenderer.invoke('sessions:reload', sessionId),
  getSessionTree: (sessionId) => ipcRenderer.invoke('sessions:getTree', sessionId),
  navigateTree: (sessionId, targetId, summarize) =>
    ipcRenderer.invoke('sessions:navigateTree', sessionId, targetId, summarize),
  forkSession: (sessionId, entryId) =>
    ipcRenderer.invoke('sessions:fork', sessionId, entryId),
  listWorkspaceFiles: (cwd, query) => ipcRenderer.invoke('workspace:listFiles', cwd, query),

  listProviders: () => ipcRenderer.invoke('providers:list'),
  listAvailableModels: () => ipcRenderer.invoke('providers:listAvailableModels'),
  saveProvider: (input) => ipcRenderer.invoke('providers:save', input),
  deleteProvider: (providerId) => ipcRenderer.invoke('providers:delete', providerId),
  fetchRemoteModels: (params) => ipcRenderer.invoke('providers:fetchRemoteModels', params),
  testConnection: (params) => ipcRenderer.invoke('providers:testConnection', params),

  listTerminals: () => ipcRenderer.invoke('terminals:list'),
  createTerminal: (options) => ipcRenderer.invoke('terminals:create', options),
  writeTerminal: (terminalId, data) => ipcRenderer.send('terminals:write', terminalId, data),
  resizeTerminal: (terminalId, cols, rows) =>
    ipcRenderer.send('terminals:resize', terminalId, cols, rows),
  killTerminal: (terminalId) => ipcRenderer.invoke('terminals:kill', terminalId),
  getTerminalBuffer: (terminalId) => ipcRenderer.invoke('terminals:getBuffer', terminalId),
  onTerminalData: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { terminalId: string; data: string },
    ) => {
      listener(payload);
    };
    ipcRenderer.on('shannon:terminal-data', handler);
    return () => {
      ipcRenderer.removeListener('shannon:terminal-data', handler);
    };
  },
  onTerminalExit: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { terminalId: string; exitCode: number | null },
    ) => {
      listener(payload);
    };
    ipcRenderer.on('shannon:terminal-exit', handler);
    return () => {
      ipcRenderer.removeListener('shannon:terminal-exit', handler);
    };
  },

  onEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: StreamEvent) => {
      listener(payload);
    };
    ipcRenderer.on('shannon:event', handler);
    return () => {
      ipcRenderer.removeListener('shannon:event', handler);
    };
  },
};

contextBridge.exposeInMainWorld('shannon', api);
