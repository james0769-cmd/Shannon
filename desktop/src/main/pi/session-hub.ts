import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import type { AgentSession, AgentSessionEvent, SessionEntry, SessionTreeNode } from '@earendil-works/pi-coding-agent';
import {
  createAgentSession,
  createCodemodeExtension,
  createMcpExtension,
  createToolSearchExtension,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import type {
  ActiveSessionSnapshot,
  AvailableModelOption,
  ContextBreakdown,
  ImageAttachment,
  ProjectResourcesInfo,
  SessionSummary,
  SessionTreeItem,
  StreamEvent,
  ThinkingLevel,
  UiMessage,
  UiMessageBlock,
  WorkspaceFileMatch,
} from '../../shared/types.js';
import { buildContextBreakdown } from './context-inspector.js';
import { createDesktopExtensionUIContext } from './desktop-ui-bridge.js';
import type { ProjectStore } from './project-store.js';
import { ProviderStore } from './provider-store.js';

interface ManagedSession {
  sessionId: string;
  sessionFile?: string;
  cwd: string;
  session: AgentSession;
  resourceLoader: DefaultResourceLoader;
  unsubscribe: () => void;
  emittedEntryIds: Set<string>;
  isStreaming: boolean;
  isBashRunning: boolean;
  needsInput: boolean;
  lastError?: string;
  lastAccessedAt: number;
}

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  'build',
  '.artifacts',
  '.next',
  '.turbo',
  '.cache',
  'target',
  '__pycache__',
]);

const BUILTIN_TOOLS = new Set([
  'read',
  'bash',
  'edit',
  'write',
  'grep',
  'find',
  'ls',
  'powershell',
]);

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b): b is { type: string; text?: string } => Boolean(b && typeof b === 'object'))
    .map((b) => (b.type === 'text' && typeof b.text === 'string' ? b.text : ''))
    .filter(Boolean)
    .join('\n');
}

function extractImagesFromContent(content: unknown): ImageAttachment[] {
  if (!Array.isArray(content)) return [];
  const images: ImageAttachment[] = [];
  for (const b of content) {
    if (
      b &&
      typeof b === 'object' &&
      (b as { type?: string }).type === 'image' &&
      typeof (b as { data?: string }).data === 'string'
    ) {
      images.push({
        type: 'image',
        data: (b as { data: string }).data,
        mimeType: (b as { mimeType?: string }).mimeType ?? 'image/png',
      });
    }
  }
  return images;
}

function entryToUiMessage(entry: SessionEntry): UiMessage | null {
  if (entry.type === 'compaction') {
    return {
      id: entry.id,
      entryId: entry.id,
      role: 'compactionSummary',
      timestamp: new Date(entry.timestamp).getTime() || Date.now(),
      summary: entry.summary,
      tokensBefore: entry.tokensBefore,
    };
  }
  if (entry.type === 'branch_summary') {
    return {
      id: entry.id,
      entryId: entry.id,
      role: 'branchSummary',
      timestamp: new Date(entry.timestamp).getTime() || Date.now(),
      summary: entry.summary,
    };
  }
  if (entry.type === 'custom_message') {
    return {
      id: entry.id,
      entryId: entry.id,
      role: 'custom',
      timestamp: new Date(entry.timestamp).getTime() || Date.now(),
      customType: entry.customType,
      text: extractTextFromContent(entry.content),
    };
  }
  if (entry.type !== 'message') return null;

  const msg = entry.message as unknown as Record<string, unknown>;
  const role = String(msg.role ?? '');
  const timestamp =
    typeof msg.timestamp === 'number'
      ? msg.timestamp
      : new Date(entry.timestamp).getTime() || Date.now();

  if (role === 'user') {
    const images = extractImagesFromContent(msg.content);
    return {
      id: entry.id,
      entryId: entry.id,
      role: 'user',
      timestamp,
      text: extractTextFromContent(msg.content),
      images: images.length > 0 ? images : undefined,
    };
  }

  if (role === 'assistant') {
    const blocks: UiMessageBlock[] = [];
    if (Array.isArray(msg.content)) {
      for (const rawBlock of msg.content) {
        if (!rawBlock || typeof rawBlock !== 'object') continue;
        const b = rawBlock as Record<string, unknown>;
        if (b.type === 'text' && typeof b.text === 'string') {
          blocks.push({ type: 'text', text: b.text });
        } else if (b.type === 'thinking' && typeof b.thinking === 'string') {
          blocks.push({ type: 'thinking', thinking: b.thinking });
        } else if (b.type === 'toolCall') {
          blocks.push({
            type: 'toolCall',
            id: String(b.id ?? ''),
            name: String(b.name ?? 'tool'),
            arguments:
              b.arguments && typeof b.arguments === 'object'
                ? (b.arguments as Record<string, unknown>)
                : {},
          });
        }
      }
    }
    const rawUsage = msg.usage as Record<string, unknown> | undefined;
    const rawCost = rawUsage?.cost as Record<string, unknown> | undefined;
    return {
      id: entry.id,
      entryId: entry.id,
      role: 'assistant',
      timestamp,
      blocks,
      model: typeof msg.model === 'string' ? msg.model : undefined,
      provider: typeof msg.provider === 'string' ? msg.provider : undefined,
      stopReason: typeof msg.stopReason === 'string' ? msg.stopReason : undefined,
      errorMessage: typeof msg.errorMessage === 'string' ? msg.errorMessage : undefined,
      usage: rawUsage
        ? {
            input: Number(rawUsage.input ?? 0),
            output: Number(rawUsage.output ?? 0),
            cacheRead: Number(rawUsage.cacheRead ?? 0),
            cacheWrite: Number(rawUsage.cacheWrite ?? 0),
            totalTokens: Number(rawUsage.totalTokens ?? 0),
            cost: Number(rawCost?.total ?? 0),
          }
        : undefined,
    };
  }

  if (role === 'toolResult') {
    const images = extractImagesFromContent(msg.content);
    return {
      id: entry.id,
      entryId: entry.id,
      role: 'toolResult',
      timestamp,
      toolCallId: typeof msg.toolCallId === 'string' ? msg.toolCallId : undefined,
      toolName: typeof msg.toolName === 'string' ? msg.toolName : undefined,
      text: extractTextFromContent(msg.content),
      images: images.length > 0 ? images : undefined,
      isError: Boolean(msg.isError),
      details:
        msg.details && typeof msg.details === 'object'
          ? (msg.details as Record<string, unknown>)
          : undefined,
    };
  }

  if (role === 'bashExecution') {
    return {
      id: entry.id,
      entryId: entry.id,
      role: 'bashExecution',
      timestamp,
      bash: {
        command: String(msg.command ?? ''),
        output: String(msg.output ?? ''),
        exitCode: typeof msg.exitCode === 'number' ? msg.exitCode : undefined,
        cancelled: Boolean(msg.cancelled),
        truncated: Boolean(msg.truncated),
        fullOutputPath:
          typeof msg.fullOutputPath === 'string' ? msg.fullOutputPath : undefined,
        excludeFromContext: Boolean(msg.excludeFromContext),
      },
    };
  }

  return null;
}

function formatEntryPreview(entry: SessionEntry): { role?: string; preview: string } {
  if (entry.type === 'compaction') {
    return { role: 'compaction', preview: `Compaction: ${entry.summary.slice(0, 72)}` };
  }
  if (entry.type === 'branch_summary') {
    return { role: 'branch_summary', preview: `Branch: ${entry.summary.slice(0, 72)}` };
  }
  if (entry.type === 'model_change') {
    return { role: 'system', preview: `Model -> ${entry.provider}/${entry.modelId}` };
  }
  if (entry.type === 'thinking_level_change') {
    return { role: 'system', preview: `Thinking -> ${entry.thinkingLevel}` };
  }
  if (entry.type === 'session_info') {
    return { role: 'system', preview: `Session named "${entry.name ?? ''}"` };
  }
  if (entry.type === 'message') {
    const msg = entry.message as unknown as Record<string, unknown>;
    const role = String(msg.role ?? 'message');
    if (role === 'bashExecution') {
      const prefix = msg.excludeFromContext ? '!!' : '!';
      return { role, preview: `${prefix}${String(msg.command ?? '').slice(0, 72)}` };
    }
    if (role === 'toolResult') {
      return { role, preview: `${String(msg.toolName ?? 'tool')} result` };
    }
    const text = extractTextFromContent(msg.content).replace(/\s+/g, ' ').trim();
    return { role, preview: text.slice(0, 80) || `[${role}]` };
  }
  return { preview: entry.type };
}

export class SessionHub {
  private readonly agentDir: string;
  private readonly projectStore: ProjectStore;
  private readonly providerStore: ProviderStore;
  private readonly emitEvent: (event: StreamEvent) => void;
  private modelRuntimePromise?: Promise<ModelRuntime>;
  private readonly active = new Map<string, ManagedSession>();
  private readonly byPath = new Map<string, string>();

  constructor(
    projectStore: ProjectStore,
    emitEvent: (event: StreamEvent) => void,
    agentDir: string = getAgentDir(),
  ) {
    this.agentDir = agentDir;
    this.projectStore = projectStore;
    this.providerStore = new ProviderStore(agentDir);
    this.emitEvent = emitEvent;
  }

  async getModelRuntime(): Promise<ModelRuntime> {
    if (!this.modelRuntimePromise) {
      this.modelRuntimePromise = ModelRuntime.create({
        authPath: join(this.agentDir, 'auth.json'),
        modelsPath: join(this.agentDir, 'models.json'),
        allowModelNetwork: false,
      });
    }
    return this.modelRuntimePromise;
  }

  getProviderStore(): ProviderStore {
    return this.providerStore;
  }

  private toAvailableModelOption(session: AgentSession, modelRuntime: ModelRuntime): AvailableModelOption | undefined {
    const m = session.model;
    if (!m) return undefined;
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
      hasAuth: modelRuntime.hasConfiguredAuth(m.provider),
    };
  }

  private buildResourcesInfo(session: AgentSession, loader: DefaultResourceLoader): ProjectResourcesInfo {
    const { agentsFiles } = loader.getAgentsFiles();
    const { skills } = loader.getSkills();
    const { prompts } = loader.getPrompts();
    const activeSet = new Set(session.getActiveToolNames());
    const tools = session.getAllTools().map((t) => {
      if (BUILTIN_TOOLS.has(t.name)) {
        return {
          name: t.name,
          description: t.description,
          source: 'builtin' as const,
          active: activeSet.has(t.name),
        };
      }
      if (t.name.startsWith('mcp__')) {
        const rest = t.name.slice('mcp__'.length);
        const sep = rest.indexOf('__');
        return {
          name: t.name,
          description: t.description,
          source: 'mcp' as const,
          mcpServer: sep > 0 ? rest.slice(0, sep) : 'mcp',
          active: activeSet.has(t.name),
        };
      }
      return {
        name: t.name,
        description: t.description,
        source: 'extension' as const,
        active: activeSet.has(t.name),
      };
    });

    const commands = [
      ...session.extensionRunner.getRegisteredCommands().map((c) => ({
        name: c.invocationName,
        description: c.description,
        source: 'extension' as const,
      })),
      ...session.promptTemplates.map((p) => ({
        name: p.name,
        description: p.description,
        source: 'prompt' as const,
      })),
      ...skills.map((s) => ({
        name: `skill:${s.name}`,
        description: s.description,
        source: 'skill' as const,
      })),
    ];

    return {
      cwd: session.sessionManager.getCwd(),
      agentsFiles: agentsFiles.map((f) => ({
        path: f.path,
        bytes: Buffer.byteLength(f.content, 'utf-8'),
        tokens: Math.ceil(f.content.length / 4),
      })),
      skills: skills.map((s) => ({
        name: s.name,
        description: s.description,
        filePath: s.filePath,
        source: s.sourceInfo.source,
      })),
      prompts: prompts.map((p) => ({
        name: p.name,
        description: p.description,
        source: p.sourceInfo.source,
      })),
      commands,
      tools,
    };
  }

  private buildTreeItems(session: AgentSession): SessionTreeItem[] {
    const rawTree = session.sessionManager.getTree();
    const leafId = session.sessionManager.getLeafId();
    const branchIds = new Set(session.sessionManager.getBranch().map((e) => e.id));

    const convert = (node: SessionTreeNode): SessionTreeItem => {
      const { role, preview } = formatEntryPreview(node.entry);
      return {
        id: node.entry.id,
        parentId: node.entry.parentId,
        type: node.entry.type,
        role,
        preview,
        timestamp: node.entry.timestamp,
        isActiveLeaf: node.entry.id === leafId,
        isOnActiveBranch: branchIds.has(node.entry.id),
        children: node.children.map(convert),
      };
    };

    return rawTree.map(convert);
  }

  private buildUiMessages(session: AgentSession): UiMessage[] {
    const branch = session.sessionManager.getBranch();
    const messages: UiMessage[] = [];
    for (const entry of branch) {
      const uiMsg = entryToUiMessage(entry);
      if (uiMsg) messages.push(uiMsg);
    }
    return messages;
  }

  private async buildSnapshot(managed: ManagedSession): Promise<ActiveSessionSnapshot> {
    const modelRuntime = await this.getModelRuntime();
    const projects = this.projectStore.listProjects();
    const resolvedCwd = resolve(managed.cwd);
    const project = projects.find((p) => resolve(p.path) === resolvedCwd);

    const branch = managed.session.sessionManager.getBranch();
    managed.emittedEntryIds = new Set(branch.map((e) => e.id));
    const messages = this.buildUiMessages(managed.session);
    const firstUserText = messages
      .find((m) => m.role === 'user' && Boolean(m.text?.trim()))
      ?.text?.replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);

    const sessionName =
      managed.session.sessionName ||
      managed.session.sessionManager.getSessionName() ||
      firstUserText ||
      '';

    return {
      sessionId: managed.sessionId,
      sessionFile: managed.sessionFile,
      cwd: managed.cwd,
      projectId: project?.id,
      name: sessionName,
      isStreaming: managed.isStreaming || managed.session.isStreaming,
      isBashRunning: managed.isBashRunning,
      isCompacting: managed.session.isCompacting,
      model: this.toAvailableModelOption(managed.session, modelRuntime),
      thinkingLevel: managed.session.thinkingLevel as ThinkingLevel,
      availableThinkingLevels: managed.session.getAvailableThinkingLevels() as ThinkingLevel[],
      messages,
      contextBreakdown: buildContextBreakdown(managed.session, managed.resourceLoader),
      tree: this.buildTreeItems(managed.session),
      resources: this.buildResourcesInfo(managed.session, managed.resourceLoader),
      queuedSteerCount: managed.session.getSteeringMessages().length,
      queuedFollowUpCount: managed.session.getFollowUpMessages().length,
    };
  }

  private attachSessionEvents(managed: ManagedSession): void {
    const sessionId = managed.sessionId;
    let pendingTextDelta = '';
    let pendingThinkingDelta = '';
    let activeMessageId = '';
    let flushTimer: ReturnType<typeof setTimeout> | undefined;

    const flushAssistantDeltas = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
      }
      if (!pendingTextDelta && !pendingThinkingDelta) return;
      this.emitEvent({
        type: 'assistant_delta',
        sessionId,
        messageId: activeMessageId || 'streaming-assistant',
        ...(pendingTextDelta ? { textDelta: pendingTextDelta } : {}),
        ...(pendingThinkingDelta ? { thinkingDelta: pendingThinkingDelta } : {}),
      });
      pendingTextDelta = '';
      pendingThinkingDelta = '';
    };

    const scheduleFlush = () => {
      if (flushTimer) return;
      flushTimer = setTimeout(flushAssistantDeltas, 25);
    };

    const emitStatus = async (error?: string) => {
      const modelRuntime = await this.getModelRuntime();
      this.emitEvent({
        type: 'session_status',
        sessionId,
        isStreaming: managed.isStreaming || managed.session.isStreaming,
        isBashRunning: managed.isBashRunning,
        isCompacting: managed.session.isCompacting,
        model: this.toAvailableModelOption(managed.session, modelRuntime),
        thinkingLevel: managed.session.thinkingLevel as ThinkingLevel,
        availableThinkingLevels: managed.session.getAvailableThinkingLevels() as ThinkingLevel[],
        ...(error ? { error } : {}),
      });
    };

    const emitNewBranchMessages = () => {
      const branch = managed.session.sessionManager.getBranch();
      for (const entry of branch) {
        if (managed.emittedEntryIds.has(entry.id)) continue;
        managed.emittedEntryIds.add(entry.id);
        const uiMsg = entryToUiMessage(entry);
        if (uiMsg) {
          this.emitEvent({
            type: 'message_committed',
            sessionId,
            message: uiMsg,
          });
        }
      }
    };

    const unsubscribe = managed.session.subscribe((event: AgentSessionEvent) => {
      if (event.type === 'agent_start') {
        managed.isStreaming = true;
        void emitStatus();
        return;
      }

      if (event.type === 'message_start') {
        const role = (event.message as { role?: string }).role;
        if (role === 'assistant') {
          activeMessageId = `stream-${Date.now()}`;
        }
        return;
      }

      if (event.type === 'message_update') {
        const amEvent = event.assistantMessageEvent;
        if (amEvent.type === 'text_delta') {
          pendingTextDelta += amEvent.delta;
          scheduleFlush();
        } else if (amEvent.type === 'thinking_delta') {
          pendingThinkingDelta += amEvent.delta;
          scheduleFlush();
        } else if (amEvent.type === 'toolcall_end') {
          flushAssistantDeltas();
          this.emitEvent({
            type: 'assistant_delta',
            sessionId,
            messageId: activeMessageId || 'streaming-assistant',
            toolCall: {
              id: amEvent.toolCall.id,
              name: amEvent.toolCall.name,
              arguments:
                amEvent.toolCall.arguments && typeof amEvent.toolCall.arguments === 'object'
                  ? (amEvent.toolCall.arguments as Record<string, unknown>)
                  : {},
            },
          });
        }
        return;
      }

      if (event.type === 'message_end') {
        flushAssistantDeltas();
        const msg = event.message as { role?: string; stopReason?: string; errorMessage?: string };
        if (msg.role === 'assistant') {
          if (msg.stopReason === 'error') {
            managed.needsInput = true;
            managed.lastError = msg.errorMessage || 'Assistant response failed';
          } else {
            managed.needsInput = false;
            managed.lastError = undefined;
          }
        }
        // AgentSession emits `message_end` before calling `sessionManager.appendMessage()`.
        // Defer to a microtask so the newly persisted entry is visible on the active branch.
        queueMicrotask(() => {
          emitNewBranchMessages();
          this.emitEvent({
            type: 'context_updated',
            sessionId,
            contextBreakdown: buildContextBreakdown(managed.session, managed.resourceLoader),
          });
        });
        return;
      }

      if (event.type === 'tool_execution_start') {
        this.emitEvent({
          type: 'tool_execution',
          sessionId,
          phase: 'start',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args:
            event.args && typeof event.args === 'object'
              ? (event.args as Record<string, unknown>)
              : undefined,
        });
        return;
      }

      if (event.type === 'tool_execution_update') {
        const partialText = extractTextFromContent(
          (event.partialResult as { content?: unknown } | undefined)?.content,
        );
        this.emitEvent({
          type: 'tool_execution',
          sessionId,
          phase: 'update',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          partialText,
        });
        return;
      }

      if (event.type === 'tool_execution_end') {
        const resultText = extractTextFromContent(
          (event.result as { content?: unknown } | undefined)?.content,
        );
        const details = (event.result as { details?: Record<string, unknown> } | undefined)?.details;
        this.emitEvent({
          type: 'tool_execution',
          sessionId,
          phase: 'end',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          resultText,
          isError: event.isError,
          details,
        });
        return;
      }

      if (event.type === 'compaction_start') {
        void emitStatus();
        return;
      }

      if (event.type === 'compaction_end') {
        void this.buildSnapshot(managed).then((snapshot) => {
          this.emitEvent({
            type: 'session_reloaded',
            sessionId,
            snapshot,
          });
        });
        return;
      }

      if (event.type === 'agent_settled') {
        flushAssistantDeltas();
        managed.isStreaming = false;
        queueMicrotask(() => {
          emitNewBranchMessages();
          void emitStatus();
          void this.buildSnapshot(managed).then((snapshot) => {
            this.emitEvent({
              type: 'session_reloaded',
              sessionId,
              snapshot,
            });
            this.emitEvent({ type: 'sessions_list_changed' });
          });
        });
      }
    });

    managed.unsubscribe = () => {
      if (flushTimer) clearTimeout(flushTimer);
      unsubscribe();
    };
  }

  private async activateSessionManager(
    sessionManager: SessionManager,
    cwd: string,
    projectDefault?: { provider: string; modelId: string; thinkingLevel?: ThinkingLevel },
  ): Promise<ManagedSession> {
    const existingId = sessionManager.getSessionId();
    const already = this.active.get(existingId);
    if (already) {
      already.lastAccessedAt = Date.now();
      return already;
    }

    const modelRuntime = await this.getModelRuntime();
    const settingsManager = SettingsManager.create(cwd, this.agentDir);
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir: this.agentDir,
      settingsManager,
      extensionFactories: [
        createMcpExtension(),
        createCodemodeExtension(),
        createToolSearchExtension(),
      ],
    });
    await resourceLoader.reload();

    let requestedModel = undefined;
    if (projectDefault) {
      requestedModel = modelRuntime.getModel(projectDefault.provider, projectDefault.modelId);
    }

    const { session } = await createAgentSession({
      cwd,
      agentDir: this.agentDir,
      modelRuntime,
      sessionManager,
      settingsManager,
      resourceLoader,
      ...(requestedModel ? { model: requestedModel } : {}),
      ...(projectDefault?.thinkingLevel ? { thinkingLevel: projectDefault.thinkingLevel } : {}),
    });

    const sessionId = session.sessionId;
    await session.bindExtensions({
      uiContext: createDesktopExtensionUIContext({
        notify: (level, message) => {
          this.emitEvent({
            type: 'ui_notification',
            sessionId,
            level,
            message,
          });
        },
      }),
    });

    const sessionFile = session.sessionFile;
    const managed: ManagedSession = {
      sessionId,
      sessionFile,
      cwd,
      session,
      resourceLoader,
      unsubscribe: () => {},
      emittedEntryIds: new Set(session.sessionManager.getBranch().map((e) => e.id)),
      isStreaming: false,
      isBashRunning: false,
      needsInput: false,
      lastAccessedAt: Date.now(),
    };

    this.attachSessionEvents(managed);
    this.active.set(sessionId, managed);
    if (sessionFile) {
      this.byPath.set(resolve(sessionFile), sessionId);
    }

    return managed;
  }

  private getManagedOrThrow(sessionId: string): ManagedSession {
    const managed = this.active.get(sessionId);
    if (!managed) {
      throw new Error(`Session is not active: ${sessionId}`);
    }
    managed.lastAccessedAt = Date.now();
    return managed;
  }

  async listSessions(): Promise<SessionSummary[]> {
    const infos = await SessionManager.listAll();
    const projects = this.projectStore.listProjects();
    const projectByPath = new Map(projects.map((p) => [resolve(p.path), p]));

    return infos.map((info) => {
      const resolvedCwd = info.cwd ? resolve(info.cwd) : '';
      const project = resolvedCwd ? projectByPath.get(resolvedCwd) : undefined;
      const activeId = this.byPath.get(resolve(info.path)) ?? info.id;
      const managed = this.active.get(activeId);

      const fallbackName =
        info.name?.trim() ||
        info.firstMessage.replace(/\s+/g, ' ').trim().slice(0, 60) ||
        'New chat';

      return {
        id: info.id,
        path: info.path,
        cwd: info.cwd || homedir(),
        projectId: project?.id,
        name: fallbackName,
        firstMessage: info.firstMessage,
        messageCount: info.messageCount,
        created: info.created.toISOString(),
        modified: info.modified.toISOString(),
        isRunning: Boolean(managed && (managed.isStreaming || managed.isBashRunning)),
        isStreaming: Boolean(managed?.isStreaming),
        hasActiveBash: Boolean(managed?.isBashRunning),
        needsInput: Boolean(managed?.needsInput),
        ...(managed?.lastError ? { lastError: managed.lastError } : {}),
        archived: this.projectStore.isSessionArchived(info.path),
      };
    });
  }

  async createSession(options?: { cwd?: string; projectId?: string }): Promise<ActiveSessionSnapshot> {
    const projects = this.projectStore.listProjects();
    const matchedProject = options?.projectId
      ? projects.find((p) => p.id === options.projectId)
      : options?.cwd
        ? projects.find((p) => resolve(p.path) === resolve(options.cwd!))
        : undefined;

    const cwd = resolve(options?.cwd ?? matchedProject?.path ?? homedir());
    const sm = SessionManager.create(cwd);
    const projectDefault =
      matchedProject?.defaultModel
        ? {
            provider: matchedProject.defaultModel.provider,
            modelId: matchedProject.defaultModel.modelId,
            thinkingLevel: matchedProject.defaultThinkingLevel,
          }
        : undefined;

    const managed = await this.activateSessionManager(sm, cwd, projectDefault);
    if (matchedProject) {
      this.projectStore.updateProject(matchedProject.id, {
        lastOpenedAt: new Date().toISOString(),
      });
    }
    this.emitEvent({ type: 'sessions_list_changed' });
    return this.buildSnapshot(managed);
  }

  async openSession(sessionPath: string): Promise<ActiveSessionSnapshot> {
    const resolvedPath = resolve(sessionPath);
    const activeId = this.byPath.get(resolvedPath);
    if (activeId) {
      const existing = this.active.get(activeId);
      if (existing) {
        existing.lastAccessedAt = Date.now();
        return this.buildSnapshot(existing);
      }
    }

    const sm = SessionManager.open(resolvedPath);
    const cwd = sm.getCwd() && existsSync(sm.getCwd()) ? sm.getCwd() : homedir();
    const managed = await this.activateSessionManager(sm, cwd);
    return this.buildSnapshot(managed);
  }

  async deleteSession(sessionPath: string): Promise<void> {
    const resolvedPath = resolve(sessionPath);
    const activeId = this.byPath.get(resolvedPath);
    if (activeId) {
      const managed = this.active.get(activeId);
      if (managed) {
        managed.unsubscribe();
        await managed.session.abort().catch(() => {});
        managed.session.dispose();
        this.active.delete(activeId);
      }
      this.byPath.delete(resolvedPath);
    }

    if (existsSync(resolvedPath)) {
      rmSync(resolvedPath, { force: true });
    }
    this.projectStore.unarchiveSession(resolvedPath);
    this.emitEvent({ type: 'sessions_list_changed' });
  }

  archiveSession(sessionPath: string): void {
    this.projectStore.archiveSession(sessionPath);
    this.emitEvent({ type: 'sessions_list_changed' });
  }

  unarchiveSession(sessionPath: string): void {
    this.projectStore.unarchiveSession(sessionPath);
    this.emitEvent({ type: 'sessions_list_changed' });
  }

  async setSessionName(sessionId: string, name: string): Promise<void> {
    const managed = this.getManagedOrThrow(sessionId);
    managed.session.setSessionName(name.trim());
    this.emitEvent({ type: 'sessions_list_changed' });
  }

  async exportSessionHtml(sessionId: string): Promise<{ path: string }> {
    const managed = this.getManagedOrThrow(sessionId);
    const outPath = await managed.session.exportToHtml();
    return { path: outPath };
  }

  async prompt(
    sessionId: string,
    message: string,
    options?: {
      images?: ImageAttachment[];
      streamingBehavior?: 'steer' | 'followUp';
    },
  ): Promise<{ disposition: 'started' | 'queued' | 'handled' }> {
    const managed = this.getManagedOrThrow(sessionId);
    const images = options?.images?.map((img) => ({
      type: 'image' as const,
      data: img.data,
      mimeType: img.mimeType,
    }));

    if (managed.session.isStreaming) {
      const behavior = options?.streamingBehavior ?? 'steer';
      if (behavior === 'followUp') {
        const res = await managed.session.followUp(message, images);
        return { disposition: res };
      }
      const res = await managed.session.steer(message, images);
      return { disposition: res };
    }

    managed.isStreaming = true;
    managed.needsInput = false;
    managed.lastError = undefined;
    this.emitEvent({
      type: 'session_status',
      sessionId,
      isStreaming: true,
      isBashRunning: managed.isBashRunning,
      isCompacting: managed.session.isCompacting,
    });

    // Run prompt asynchronously so IPC returns immediately while events stream
    void managed.session
      .prompt(message, {
        ...(images && images.length > 0 ? { images } : {}),
      })
      .catch((error) => {
        const errMsg = error instanceof Error ? error.message : String(error);
        managed.isStreaming = false;
        managed.needsInput = true;
        managed.lastError = errMsg;
        this.emitEvent({
          type: 'ui_notification',
          sessionId,
          level: 'error',
          message: errMsg,
        });
        this.emitEvent({
          type: 'session_status',
          sessionId,
          isStreaming: false,
          isBashRunning: managed.isBashRunning,
          isCompacting: managed.session.isCompacting,
          error: errMsg,
        });
        this.emitEvent({ type: 'sessions_list_changed' });
      });

    return { disposition: 'started' };
  }

  async abort(sessionId: string): Promise<void> {
    const managed = this.getManagedOrThrow(sessionId);
    await managed.session.abort();
    managed.isStreaming = false;
  }

  async executeBash(
    sessionId: string,
    command: string,
    excludeFromContext: boolean,
  ): Promise<{
    runId: string;
    output: string;
    exitCode?: number;
    cancelled: boolean;
    truncated: boolean;
    fullOutputPath?: string;
  }> {
    const managed = this.getManagedOrThrow(sessionId);
    const runId = randomUUID();
    managed.isBashRunning = true;
    managed.needsInput = false;
    managed.lastError = undefined;

    this.emitEvent({
      type: 'session_status',
      sessionId,
      isStreaming: managed.isStreaming,
      isBashRunning: true,
      isCompacting: managed.session.isCompacting,
    });

    let pendingChunk = '';
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const flushChunk = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
      }
      if (!pendingChunk) return;
      this.emitEvent({
        type: 'bash_update',
        sessionId,
        runId,
        command,
        excludeFromContext,
        chunk: pendingChunk,
      });
      pendingChunk = '';
    };

    try {
      const result = await managed.session.executeBash(
        command,
        (chunk) => {
          pendingChunk += chunk;
          if (!flushTimer) {
            flushTimer = setTimeout(flushChunk, 30);
          }
        },
        { excludeFromContext },
      );

      flushChunk();
      managed.isBashRunning = false;

      this.emitEvent({
        type: 'bash_update',
        sessionId,
        runId,
        command,
        excludeFromContext,
        done: true,
        exitCode: result.exitCode,
        cancelled: result.cancelled,
        truncated: result.truncated,
        fullOutputPath: result.fullOutputPath,
      });

      const snapshot = await this.buildSnapshot(managed);
      this.emitEvent({
        type: 'session_reloaded',
        sessionId,
        snapshot,
      });
      this.emitEvent({ type: 'sessions_list_changed' });

      return {
        runId,
        output: result.output,
        exitCode: result.exitCode,
        cancelled: result.cancelled,
        truncated: result.truncated,
        fullOutputPath: result.fullOutputPath,
      };
    } catch (error) {
      flushChunk();
      managed.isBashRunning = false;
      this.emitEvent({
        type: 'session_status',
        sessionId,
        isStreaming: managed.isStreaming,
        isBashRunning: false,
        isCompacting: managed.session.isCompacting,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async abortBash(sessionId: string): Promise<void> {
    const managed = this.getManagedOrThrow(sessionId);
    managed.session.abortBash();
    managed.isBashRunning = false;
  }

  async setModel(sessionId: string, provider: string, modelId: string): Promise<ActiveSessionSnapshot> {
    const managed = this.getManagedOrThrow(sessionId);
    const modelRuntime = await this.getModelRuntime();
    const model = modelRuntime.getModel(provider, modelId);
    if (!model) {
      throw new Error(`Model not found: ${provider}/${modelId}`);
    }
    await managed.session.setModel(model);
    return this.buildSnapshot(managed);
  }

  async setThinkingLevel(sessionId: string, level: ThinkingLevel): Promise<ActiveSessionSnapshot> {
    const managed = this.getManagedOrThrow(sessionId);
    managed.session.setThinkingLevel(level);
    return this.buildSnapshot(managed);
  }

  async getContextBreakdown(sessionId: string): Promise<ContextBreakdown> {
    const managed = this.getManagedOrThrow(sessionId);
    return buildContextBreakdown(managed.session, managed.resourceLoader);
  }

  async compactSession(sessionId: string, customInstructions?: string): Promise<ActiveSessionSnapshot> {
    const managed = this.getManagedOrThrow(sessionId);
    await managed.session.compact(customInstructions?.trim() || undefined);
    this.emitEvent({ type: 'sessions_list_changed' });
    return this.buildSnapshot(managed);
  }

  async reloadSession(sessionId: string): Promise<ActiveSessionSnapshot> {
    const managed = this.getManagedOrThrow(sessionId);
    await managed.session.reload();
    return this.buildSnapshot(managed);
  }

  async getSessionTree(sessionId: string): Promise<SessionTreeItem[]> {
    const managed = this.getManagedOrThrow(sessionId);
    return this.buildTreeItems(managed.session);
  }

  async navigateTree(
    sessionId: string,
    targetId: string,
    summarize = false,
  ): Promise<ActiveSessionSnapshot> {
    const managed = this.getManagedOrThrow(sessionId);
    await managed.session.navigateTree(targetId, { summarize });
    this.emitEvent({ type: 'sessions_list_changed' });
    return this.buildSnapshot(managed);
  }

  async forkSession(sessionId: string, entryId: string): Promise<ActiveSessionSnapshot> {
    const managed = this.getManagedOrThrow(sessionId);
    const sourceFile = managed.session.sessionFile;
    if (!sourceFile || !existsSync(sourceFile)) {
      throw new Error('Cannot fork before the session has a persisted conversation message');
    }

    // Use a separate SessionManager instance so the active session is never mutated
    const tempSm = SessionManager.open(sourceFile, managed.session.sessionManager.getSessionDir(), managed.cwd);
    const newSessionPath = tempSm.createBranchedSession(entryId);
    if (!newSessionPath) {
      throw new Error('Failed to create branched session file');
    }

    const parentName = managed.session.sessionName || basename(sourceFile);
    const forkedSnapshot = await this.openSession(newSessionPath);
    const forkedManaged = this.active.get(forkedSnapshot.sessionId);
    if (forkedManaged && !forkedManaged.session.sessionName) {
      forkedManaged.session.setSessionName(`Fork of ${parentName}`);
    }
    this.emitEvent({ type: 'sessions_list_changed' });
    return forkedManaged ? this.buildSnapshot(forkedManaged) : forkedSnapshot;
  }

  listWorkspaceFiles(cwd: string, query: string): WorkspaceFileMatch[] {
    const root = resolve(cwd);
    if (!existsSync(root)) return [];

    const normalizedQuery = query.trim().toLowerCase();
    const matches: WorkspaceFileMatch[] = [];
    const queue: string[] = [root];
    let visited = 0;
    const maxVisited = 1500;

    while (queue.length > 0 && visited < maxVisited) {
      const current = queue.shift()!;
      let entries;
      try {
        entries = readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.env' && entry.name !== '.pi') {
          if (SKIP_DIRS.has(entry.name)) continue;
        }
        if (SKIP_DIRS.has(entry.name)) continue;

        const fullPath = join(current, entry.name);
        const rel = relative(root, fullPath);
        const isDir = entry.isDirectory();
        visited++;

        if (
          !normalizedQuery ||
          rel.toLowerCase().includes(normalizedQuery) ||
          entry.name.toLowerCase().includes(normalizedQuery)
        ) {
          matches.push({
            relativePath: rel,
            name: entry.name,
            isDirectory: isDir,
          });
        }

        if (isDir) {
          queue.push(fullPath);
        }

        if (visited >= maxVisited) break;
      }
    }

    return matches
      .sort((a, b) => {
        const aExact = a.name.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
        const bExact = b.name.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return a.relativePath.length - b.relativePath.length;
      })
      .slice(0, 30);
  }

  async disposeAll(): Promise<void> {
    for (const managed of this.active.values()) {
      managed.unsubscribe();
      await managed.session.abort().catch(() => {});
      managed.session.dispose();
    }
    this.active.clear();
    this.byPath.clear();
  }
}
