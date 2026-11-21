import { create } from 'zustand';
import type {
  ActiveSessionSnapshot,
  AvailableModelOption,
  ImageAttachment,
  ProjectRecord,
  ProviderEntry,
  SessionSummary,
  StreamEvent,
  ThemeMode,
  ThinkingLevel,
  UiMessageBlock,
} from '@shared/types';

export interface StreamingAssistantBuffer {
  messageId: string;
  text: string;
  thinking: string;
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
}

export interface LiveToolExecution {
  toolCallId: string;
  toolName: string;
  phase: 'start' | 'update' | 'end';
  args?: Record<string, unknown>;
  partialText?: string;
  resultText?: string;
  isError?: boolean;
  details?: Record<string, unknown>;
}

export interface LiveBashBuffer {
  runId: string;
  command: string;
  excludeFromContext: boolean;
  output: string;
  done: boolean;
  exitCode?: number;
  cancelled?: boolean;
  truncated?: boolean;
  fullOutputPath?: string;
}

export interface ToastNotice {
  id: string;
  level: 'info' | 'warning' | 'error';
  message: string;
}

export type InspectorTab = 'context' | 'tree' | 'resources';
export type SidebarView = 'code' | 'archive';

interface AppState {
  initialized: boolean;
  theme: ThemeMode;
  agentDir: string;
  sidebarCollapsed: boolean;
  sidebarView: SidebarView;
  inspectorOpen: boolean;
  inspectorTab: InspectorTab;
  settingsOpen: boolean;
  commandPaletteOpen: boolean;
  highlightedEntryId: string | null;

  projects: ProjectRecord[];
  sessions: SessionSummary[];
  providers: ProviderEntry[];
  availableModels: AvailableModelOption[];

  sessionHistory: string[];
  sessionHistoryIndex: number;

  activeSession: ActiveSessionSnapshot | null;
  streamingBySession: Record<string, StreamingAssistantBuffer | undefined>;
  liveToolsBySession: Record<string, Record<string, LiveToolExecution>>;
  liveBashBySession: Record<string, LiveBashBuffer | undefined>;
  runStartedAtBySession: Record<string, number | undefined>;
  needsInputBySession: Record<string, boolean>;
  composerPrefill: string | null;
  toasts: ToastNotice[];

  // Actions
  init: () => Promise<void>;
  setTheme: (theme: ThemeMode) => Promise<void>;
  toggleSidebar: () => Promise<void>;
  setSidebarView: (view: SidebarView) => void;
  navigateHistoryBack: () => Promise<void>;
  navigateHistoryForward: () => Promise<void>;
  openInspector: (tab?: InspectorTab) => void;
  closeInspector: () => void;
  setSettingsOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  highlightEntry: (entryId: string | null) => void;
  setComposerPrefill: (text: string | null) => void;
  pushToast: (level: 'info' | 'warning' | 'error', message: string) => void;
  dismissToast: (id: string) => void;

  refreshProjectsAndSessions: () => Promise<void>;
  refreshProviders: () => Promise<void>;
  addProject: (dirPath?: string) => Promise<ProjectRecord | null>;
  removeProject: (projectId: string) => Promise<void>;
  togglePinProject: (projectId: string) => Promise<void>;

  createNewSession: (options?: { cwd?: string; projectId?: string }) => Promise<void>;
  openSessionByPath: (sessionPath: string, pushHistory?: boolean) => Promise<void>;
  deleteSessionByPath: (sessionPath: string) => Promise<void>;
  archiveSessionByPath: (sessionPath: string) => Promise<void>;
  unarchiveSessionByPath: (sessionPath: string) => Promise<void>;
  renameSession: (sessionId: string, name: string) => Promise<void>;
  exportActiveSessionHtml: () => Promise<void>;

  sendPrompt: (
    text: string,
    options?: { images?: ImageAttachment[]; streamingBehavior?: 'steer' | 'followUp' },
  ) => Promise<void>;
  abortActiveRun: () => Promise<void>;
  runBashCommand: (command: string, excludeFromContext: boolean) => Promise<void>;
  abortActiveBash: () => Promise<void>;
  changeModel: (provider: string, modelId: string) => Promise<void>;
  changeThinkingLevel: (level: ThinkingLevel) => Promise<void>;
  compactActiveSession: (customInstructions?: string) => Promise<void>;
  reloadActiveSession: () => Promise<void>;
  navigateSessionTree: (targetId: string, summarize?: boolean) => Promise<void>;
  forkFromEntry: (entryId: string) => Promise<void>;

  handleStreamEvent: (event: StreamEvent) => void;
}

function pushSessionHistory(
  history: string[],
  index: number,
  sessionPath: string | undefined,
): { sessionHistory: string[]; sessionHistoryIndex: number } {
  if (!sessionPath) return { sessionHistory: history, sessionHistoryIndex: index };
  if (history[index] === sessionPath) {
    return { sessionHistory: history, sessionHistoryIndex: index };
  }
  const sliced = history.slice(0, index + 1);
  sliced.push(sessionPath);
  return {
    sessionHistory: sliced.slice(-40),
    sessionHistoryIndex: Math.min(sliced.length - 1, 39),
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,
  theme: 'system',
  agentDir: '',
  sidebarCollapsed: false,
  sidebarView: 'code',
  inspectorOpen: false,
  inspectorTab: 'context',
  settingsOpen: false,
  commandPaletteOpen: false,
  highlightedEntryId: null,

  projects: [],
  sessions: [],
  providers: [],
  availableModels: [],

  sessionHistory: [],
  sessionHistoryIndex: -1,

  activeSession: null,
  streamingBySession: {},
  liveToolsBySession: {},
  liveBashBySession: {},
  runStartedAtBySession: {},
  needsInputBySession: {},
  composerPrefill: null,
  toasts: [],

  init: async () => {
    const [config, projects, sessions, providers, availableModels] = await Promise.all([
      window.shannon.getAppConfig(),
      window.shannon.listProjects(),
      window.shannon.listSessions(),
      window.shannon.listProviders(),
      window.shannon.listAvailableModels(),
    ]);

    set({
      initialized: true,
      theme: config.theme,
      agentDir: config.agentDir,
      sidebarCollapsed: config.sidebarCollapsed,
      projects,
      sessions,
      providers,
      availableModels,
    });

    const initialSession = sessions.find((s) => !s.archived) ?? sessions[0];
    if (!get().activeSession && initialSession) {
      try {
        const snapshot = await window.shannon.openSession(initialSession.path);
        set({
          activeSession: snapshot,
          ...pushSessionHistory([], -1, snapshot.sessionFile),
        });
      } catch {
        // Ignore stale session errors on startup
      }
    }
  },

  setTheme: async (theme) => {
    set({ theme });
    await window.shannon.setTheme(theme);
  },

  toggleSidebar: async () => {
    const next = !get().sidebarCollapsed;
    set({ sidebarCollapsed: next });
    await window.shannon.setSidebarCollapsed(next);
  },

  setSidebarView: (view) => set({ sidebarView: view }),

  navigateHistoryBack: async () => {
    const { sessionHistory, sessionHistoryIndex, openSessionByPath } = get();
    if (sessionHistoryIndex <= 0) return;
    const nextIndex = sessionHistoryIndex - 1;
    const targetPath = sessionHistory[nextIndex];
    if (!targetPath) return;
    set({ sessionHistoryIndex: nextIndex });
    await openSessionByPath(targetPath, false);
  },

  navigateHistoryForward: async () => {
    const { sessionHistory, sessionHistoryIndex, openSessionByPath } = get();
    if (sessionHistoryIndex >= sessionHistory.length - 1) return;
    const nextIndex = sessionHistoryIndex + 1;
    const targetPath = sessionHistory[nextIndex];
    if (!targetPath) return;
    set({ sessionHistoryIndex: nextIndex });
    await openSessionByPath(targetPath, false);
  },

  openInspector: (tab) => {
    set((s) => ({
      inspectorOpen: true,
      inspectorTab: tab ?? s.inspectorTab,
    }));
  },

  closeInspector: () => set({ inspectorOpen: false }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  highlightEntry: (entryId) => set({ highlightedEntryId: entryId }),
  setComposerPrefill: (text) => set({ composerPrefill: text }),

  pushToast: (level, message) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, level, message }] }));
    setTimeout(() => {
      get().dismissToast(id);
    }, 5000);
  },

  dismissToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  refreshProjectsAndSessions: async () => {
    const [projects, sessions] = await Promise.all([
      window.shannon.listProjects(),
      window.shannon.listSessions(),
    ]);
    set({ projects, sessions });
  },

  refreshProviders: async () => {
    const [providers, availableModels] = await Promise.all([
      window.shannon.listProviders(),
      window.shannon.listAvailableModels(),
    ]);
    set({ providers, availableModels });
  },

  addProject: async (dirPath) => {
    const project = await window.shannon.addProject(dirPath);
    if (!project) return null;
    await get().refreshProjectsAndSessions();
    const snapshot = await window.shannon.createSession({
      cwd: project.path,
      projectId: project.id,
    });
    set((s) => ({
      activeSession: snapshot,
      ...pushSessionHistory(s.sessionHistory, s.sessionHistoryIndex, snapshot.sessionFile),
    }));
    await get().refreshProjectsAndSessions();
    return project;
  },

  removeProject: async (projectId) => {
    await window.shannon.removeProject(projectId);
    await get().refreshProjectsAndSessions();
  },

  togglePinProject: async (projectId) => {
    const target = get().projects.find((p) => p.id === projectId);
    if (!target) return;
    await window.shannon.updateProject(projectId, { pinned: !target.pinned });
    await get().refreshProjectsAndSessions();
  },

  createNewSession: async (options) => {
    const snapshot = await window.shannon.createSession(options);
    set((s) => ({
      activeSession: snapshot,
      highlightedEntryId: null,
      ...pushSessionHistory(s.sessionHistory, s.sessionHistoryIndex, snapshot.sessionFile),
    }));
    await get().refreshProjectsAndSessions();
  },

  openSessionByPath: async (sessionPath, pushHistory = true) => {
    const snapshot = await window.shannon.openSession(sessionPath);
    set((s) => ({
      activeSession: snapshot,
      highlightedEntryId: null,
      ...(pushHistory
        ? pushSessionHistory(s.sessionHistory, s.sessionHistoryIndex, snapshot.sessionFile ?? sessionPath)
        : {}),
    }));
  },

  deleteSessionByPath: async (sessionPath) => {
    const active = get().activeSession;
    await window.shannon.deleteSession(sessionPath);
    set((s) => {
      const nextHistory = s.sessionHistory.filter((p) => p !== sessionPath);
      return {
        sessionHistory: nextHistory,
        sessionHistoryIndex: Math.min(s.sessionHistoryIndex, nextHistory.length - 1),
      };
    });
    await get().refreshProjectsAndSessions();
    if (active?.sessionFile === sessionPath) {
      const remaining = get().sessions.filter((s) => !s.archived);
      if (remaining.length > 0) {
        const nextSnap = await window.shannon.openSession(remaining[0].path);
        set({ activeSession: nextSnap });
      } else {
        set({ activeSession: null });
      }
    }
  },

  archiveSessionByPath: async (sessionPath) => {
    const active = get().activeSession;
    await window.shannon.archiveSession(sessionPath);
    await get().refreshProjectsAndSessions();
    if (active?.sessionFile === sessionPath) {
      const remaining = get().sessions.filter((s) => !s.archived);
      if (remaining.length > 0) {
        const nextSnap = await window.shannon.openSession(remaining[0].path);
        set({ activeSession: nextSnap });
      }
    }
    get().pushToast('info', 'Moved chat to Archive');
  },

  unarchiveSessionByPath: async (sessionPath) => {
    await window.shannon.unarchiveSession(sessionPath);
    await get().refreshProjectsAndSessions();
    get().pushToast('info', 'Restored chat from Archive');
  },

  renameSession: async (sessionId, name) => {
    await window.shannon.setSessionName(sessionId, name);
    set((s) => ({
      activeSession:
        s.activeSession?.sessionId === sessionId
          ? { ...s.activeSession, name }
          : s.activeSession,
    }));
    await get().refreshProjectsAndSessions();
  },

  exportActiveSessionHtml: async () => {
    const active = get().activeSession;
    if (!active) return;
    const { path } = await window.shannon.exportSessionHtml(active.sessionId);
    get().pushToast('info', `Exported HTML to ${path}`);
    window.shannon.revealInFinder(path);
  },

  sendPrompt: async (text, options) => {
    let active = get().activeSession;
    if (!active) {
      active = await window.shannon.createSession();
      set((s) => ({
        activeSession: active,
        ...pushSessionHistory(s.sessionHistory, s.sessionHistoryIndex, active?.sessionFile),
      }));
      await get().refreshProjectsAndSessions();
    }

    const sessionId = active.sessionId;
    set((s) => ({
      needsInputBySession: { ...s.needsInputBySession, [sessionId]: false },
      runStartedAtBySession: {
        ...s.runStartedAtBySession,
        [sessionId]: s.runStartedAtBySession[sessionId] ?? Date.now(),
      },
    }));

    try {
      await window.shannon.prompt(sessionId, text, options);
    } catch (error) {
      set((s) => ({
        needsInputBySession: { ...s.needsInputBySession, [sessionId]: true },
      }));
      get().pushToast('error', error instanceof Error ? error.message : String(error));
    }
  },

  abortActiveRun: async () => {
    const active = get().activeSession;
    if (!active) return;
    await window.shannon.abort(active.sessionId);
  },

  runBashCommand: async (command, excludeFromContext) => {
    let active = get().activeSession;
    if (!active) {
      active = await window.shannon.createSession();
      set((s) => ({
        activeSession: active,
        ...pushSessionHistory(s.sessionHistory, s.sessionHistoryIndex, active?.sessionFile),
      }));
      await get().refreshProjectsAndSessions();
    }

    const sessionId = active.sessionId;
    set((s) => ({
      needsInputBySession: { ...s.needsInputBySession, [sessionId]: false },
      runStartedAtBySession: {
        ...s.runStartedAtBySession,
        [sessionId]: s.runStartedAtBySession[sessionId] ?? Date.now(),
      },
      liveBashBySession: {
        ...s.liveBashBySession,
        [sessionId]: {
          runId: 'pending',
          command,
          excludeFromContext,
          output: '',
          done: false,
        },
      },
    }));

    try {
      await window.shannon.executeBash(sessionId, command, excludeFromContext);
    } catch (error) {
      set((s) => {
        const next = { ...s.liveBashBySession };
        delete next[sessionId];
        const nextRuns = { ...s.runStartedAtBySession };
        delete nextRuns[sessionId];
        return {
          liveBashBySession: next,
          runStartedAtBySession: nextRuns,
          needsInputBySession: { ...s.needsInputBySession, [sessionId]: true },
        };
      });
      get().pushToast('error', error instanceof Error ? error.message : String(error));
    }
  },

  abortActiveBash: async () => {
    const active = get().activeSession;
    if (!active) return;
    await window.shannon.abortBash(active.sessionId);
  },

  changeModel: async (provider, modelId) => {
    const active = get().activeSession;
    if (!active) return;
    const snapshot = await window.shannon.setModel(active.sessionId, provider, modelId);
    set({ activeSession: snapshot });
  },

  changeThinkingLevel: async (level) => {
    const active = get().activeSession;
    if (!active) return;
    const snapshot = await window.shannon.setThinkingLevel(active.sessionId, level);
    set({ activeSession: snapshot });
  },

  compactActiveSession: async (customInstructions) => {
    const active = get().activeSession;
    if (!active) return;
    try {
      const snapshot = await window.shannon.compactSession(active.sessionId, customInstructions);
      set({ activeSession: snapshot });
      get().pushToast('info', 'Context compacted cleanly');
    } catch (error) {
      get().pushToast('error', error instanceof Error ? error.message : String(error));
    }
  },

  reloadActiveSession: async () => {
    const active = get().activeSession;
    if (!active) return;
    try {
      const snapshot = await window.shannon.reloadSession(active.sessionId);
      set({ activeSession: snapshot });
      get().pushToast('info', 'Reloaded extensions, skills, prompts & context files');
    } catch (error) {
      get().pushToast('error', error instanceof Error ? error.message : String(error));
    }
  },

  navigateSessionTree: async (targetId, summarize = false) => {
    const active = get().activeSession;
    if (!active) return;
    try {
      const snapshot = await window.shannon.navigateTree(active.sessionId, targetId, summarize);
      set({ activeSession: snapshot });
    } catch (error) {
      get().pushToast('error', error instanceof Error ? error.message : String(error));
    }
  },

  forkFromEntry: async (entryId) => {
    const active = get().activeSession;
    if (!active) return;
    try {
      const snapshot = await window.shannon.forkSession(active.sessionId, entryId);
      set((s) => ({
        activeSession: snapshot,
        ...pushSessionHistory(s.sessionHistory, s.sessionHistoryIndex, snapshot.sessionFile),
      }));
      await get().refreshProjectsAndSessions();
      get().pushToast('info', 'Forked into new session');
    } catch (error) {
      get().pushToast('error', error instanceof Error ? error.message : String(error));
    }
  },

  handleStreamEvent: (event) => {
    if (event.type === 'sessions_list_changed') {
      void get().refreshProjectsAndSessions();
      return;
    }

    if (event.type === 'ui_notification') {
      get().pushToast(event.level, event.message);
      return;
    }

    if (event.type === 'assistant_delta') {
      set((s) => {
        const prev = s.streamingBySession[event.sessionId] ?? {
          messageId: event.messageId,
          text: '',
          thinking: '',
          toolCalls: [],
        };
        const toolCalls = event.toolCall
          ? [...prev.toolCalls, event.toolCall]
          : prev.toolCalls;
        return {
          streamingBySession: {
            ...s.streamingBySession,
            [event.sessionId]: {
              messageId: event.messageId,
              text: prev.text + (event.textDelta ?? ''),
              thinking: prev.thinking + (event.thinkingDelta ?? ''),
              toolCalls,
            },
          },
          runStartedAtBySession: {
            ...s.runStartedAtBySession,
            [event.sessionId]: s.runStartedAtBySession[event.sessionId] ?? Date.now(),
          },
        };
      });
      return;
    }

    if (event.type === 'message_committed') {
      set((s) => {
        const nextStreaming = { ...s.streamingBySession };
        if (event.message.role === 'assistant') {
          delete nextStreaming[event.sessionId];
        }
        const active = s.activeSession;
        if (!active || active.sessionId !== event.sessionId) {
          return { streamingBySession: nextStreaming };
        }
        const exists = active.messages.some((m) => m.id === event.message.id);
        const messages = exists
          ? active.messages.map((m) => (m.id === event.message.id ? event.message : m))
          : [...active.messages, event.message];

        let nextTools = s.liveToolsBySession;
        if (event.message.role === 'toolResult' && event.message.toolCallId) {
          const sessionTools = { ...(s.liveToolsBySession[event.sessionId] ?? {}) };
          delete sessionTools[event.message.toolCallId];
          nextTools = { ...s.liveToolsBySession, [event.sessionId]: sessionTools };
        }

        const nextNeedsInput =
          event.message.role === 'assistant' && event.message.stopReason === 'error'
            ? { ...s.needsInputBySession, [event.sessionId]: true }
            : s.needsInputBySession;

        return {
          streamingBySession: nextStreaming,
          liveToolsBySession: nextTools,
          needsInputBySession: nextNeedsInput,
          activeSession: {
            ...active,
            messages,
          },
        };
      });
      return;
    }

    if (event.type === 'tool_execution') {
      set((s) => {
        const sessionTools = { ...(s.liveToolsBySession[event.sessionId] ?? {}) };
        const existing = sessionTools[event.toolCallId];
        sessionTools[event.toolCallId] = {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          phase: event.phase,
          args: event.args ?? existing?.args,
          partialText: event.partialText ?? existing?.partialText,
          resultText: event.resultText ?? existing?.resultText,
          isError: event.isError ?? existing?.isError,
          details: event.details ?? existing?.details,
        };
        return {
          liveToolsBySession: {
            ...s.liveToolsBySession,
            [event.sessionId]: sessionTools,
          },
        };
      });
      return;
    }

    if (event.type === 'bash_update') {
      set((s) => {
        const prev = s.liveBashBySession[event.sessionId];
        const nextBuffer: LiveBashBuffer = {
          runId: event.runId,
          command: event.command,
          excludeFromContext: event.excludeFromContext,
          output: (prev?.output ?? '') + (event.chunk ?? ''),
          done: Boolean(event.done),
          exitCode: event.exitCode ?? prev?.exitCode,
          cancelled: event.cancelled ?? prev?.cancelled,
          truncated: event.truncated ?? prev?.truncated,
          fullOutputPath: event.fullOutputPath ?? prev?.fullOutputPath,
        };
        return {
          liveBashBySession: {
            ...s.liveBashBySession,
            [event.sessionId]: nextBuffer,
          },
        };
      });
      return;
    }

    if (event.type === 'session_status') {
      set((s) => {
        const nextStreaming = { ...s.streamingBySession };
        if (!event.isStreaming) {
          delete nextStreaming[event.sessionId];
        }

        const isRunning = event.isStreaming || event.isBashRunning;
        const nextRuns = { ...s.runStartedAtBySession };
        if (isRunning) {
          nextRuns[event.sessionId] = nextRuns[event.sessionId] ?? Date.now();
        } else {
          delete nextRuns[event.sessionId];
        }

        const nextNeedsInput = event.error
          ? { ...s.needsInputBySession, [event.sessionId]: true }
          : s.needsInputBySession;

        const active = s.activeSession;
        if (!active || active.sessionId !== event.sessionId) {
          return {
            streamingBySession: nextStreaming,
            runStartedAtBySession: nextRuns,
            needsInputBySession: nextNeedsInput,
          };
        }
        return {
          streamingBySession: nextStreaming,
          runStartedAtBySession: nextRuns,
          needsInputBySession: nextNeedsInput,
          activeSession: {
            ...active,
            isStreaming: event.isStreaming,
            isBashRunning: event.isBashRunning,
            isCompacting: event.isCompacting,
            ...(event.model ? { model: event.model } : {}),
            ...(event.thinkingLevel ? { thinkingLevel: event.thinkingLevel } : {}),
            ...(event.availableThinkingLevels
              ? { availableThinkingLevels: event.availableThinkingLevels }
              : {}),
          },
        };
      });
      return;
    }

    if (event.type === 'context_updated') {
      set((s) => {
        if (!s.activeSession || s.activeSession.sessionId !== event.sessionId) return s;
        return {
          activeSession: {
            ...s.activeSession,
            contextBreakdown: event.contextBreakdown,
          },
        };
      });
      return;
    }

    if (event.type === 'session_reloaded') {
      set((s) => {
        const nextBash = { ...s.liveBashBySession };
        delete nextBash[event.sessionId];
        const nextStreaming = { ...s.streamingBySession };
        delete nextStreaming[event.sessionId];
        const nextTools = { ...s.liveToolsBySession };
        delete nextTools[event.sessionId];
        const nextRuns = { ...s.runStartedAtBySession };
        if (!event.snapshot.isStreaming && !event.snapshot.isBashRunning) {
          delete nextRuns[event.sessionId];
        }

        if (!s.activeSession || s.activeSession.sessionId !== event.sessionId) {
          return {
            liveBashBySession: nextBash,
            streamingBySession: nextStreaming,
            liveToolsBySession: nextTools,
            runStartedAtBySession: nextRuns,
          };
        }
        return {
          liveBashBySession: nextBash,
          streamingBySession: nextStreaming,
          liveToolsBySession: nextTools,
          runStartedAtBySession: nextRuns,
          activeSession: event.snapshot,
        };
      });
    }
  },
}));

export function mergeToolResults(messages: ActiveSessionSnapshot['messages']) {
  const resultsByToolCallId = new Map<string, ActiveSessionSnapshot['messages'][number]>();
  for (const m of messages) {
    if (m.role === 'toolResult' && m.toolCallId) {
      resultsByToolCallId.set(m.toolCallId, m);
    }
  }
  return resultsByToolCallId;
}

export function extractBlocksText(blocks: UiMessageBlock[] | undefined): string {
  if (!blocks) return '';
  return blocks
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}
