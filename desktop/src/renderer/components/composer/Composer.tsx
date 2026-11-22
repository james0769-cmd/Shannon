import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  ChevronDown,
  FileCode2,
  Folder,
  FolderPlus,
  ImagePlus,
  Plus,
  Square,
  Terminal,
  X,
} from 'lucide-react';
import type {
  ImageAttachment,
  SlashCommandItem,
  ThinkingLevel,
  WorkspaceFileMatch,
} from '@shared/types';
import { extractBlocksText, useAppStore } from '../../stores/app-store.js';

const BUILTIN_SLASH_COMMANDS: SlashCommandItem[] = [
  { name: 'new', description: 'Start a new conversation in current project', source: 'builtin' },
  { name: 'resume', description: 'Search and resume another conversation (⌘K)', source: 'builtin' },
  { name: 'name', argsHint: '<title>', description: 'Rename the current session', source: 'builtin' },
  { name: 'context', description: 'Open itemized context token breakdown', source: 'builtin' },
  { name: 'session', description: 'Show current session stats and token usage', source: 'builtin' },
  {
    name: 'compact',
    argsHint: '[instructions]',
    description: 'Compact conversation context now',
    source: 'builtin',
  },
  { name: 'tree', description: 'Open session branch tree viewer', source: 'builtin' },
  { name: 'fork', description: 'Fork a new session from the latest user message', source: 'builtin' },
  { name: 'copy', description: 'Copy the last assistant message to clipboard', source: 'builtin' },
  { name: 'export', description: 'Export current session to HTML', source: 'builtin' },
  { name: 'model', argsHint: '[filter]', description: 'Switch or filter active model', source: 'builtin' },
  {
    name: 'thinking',
    argsHint: '[level]',
    description: 'Set thinking level (off / low / medium / high / max)',
    source: 'builtin',
  },
  { name: 'settings', description: 'Open API & Models settings', source: 'builtin' },
  { name: 'login', description: 'Configure provider API keys & credentials', source: 'builtin' },
  {
    name: 'resources',
    description: 'Inspect loaded AGENTS.md, skills, prompts & tools',
    source: 'builtin',
  },
  {
    name: 'reload',
    description: 'Reload extensions, skills, prompt templates & context files',
    source: 'builtin',
  },
  { name: 'archive', description: 'Archive the current conversation', source: 'builtin' },
];

const THINKING_LABELS: Record<ThinkingLevel, string> = {
  off: 'Off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
};

const KBD_KEY_CLASS =
  'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-[var(--border-strong)] bg-[var(--bg-subtle)]/60 px-1 text-[10px] leading-none text-[var(--text-muted)]';

function formatContextCompact(cw: number | null | undefined): string {
  if (!cw || cw <= 0) return '';
  if (cw >= 950_000) return `${Math.round(cw / 1_000_000)}M`;
  if (cw >= 1_000) return `${Math.round(cw / 1_000)}k`;
  return String(cw);
}

function getInlineContextLabel(name: string, cw: number | null | undefined): string {
  const tag = formatContextCompact(cw);
  if (!tag) return '';
  return name.toLowerCase().includes(tag.toLowerCase()) ? '' : tag;
}

function formatTokenShort(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export const Composer: React.FC = () => {
  const {
    activeSession,
    projects,
    availableModels,
    composerPrefill,
    inspectorOpen,
    inspectorTab,
    setComposerPrefill,
    sendPrompt,
    abortActiveRun,
    runBashCommand,
    abortActiveBash,
    changeModel,
    changeThinkingLevel,
    compactActiveSession,
    reloadActiveSession,
    createNewSession,
    renameSession,
    forkFromEntry,
    exportActiveSessionHtml,
    archiveSessionByPath,
    addProject,
    openInspector,
    closeInspector,
    setSettingsOpen,
    setCommandPaletteOpen,
    pushToast,
  } = useAppStore();

  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [fileMatches, setFileMatches] = useState<WorkspaceFileMatch[]>([]);
  const [atRange, setAtRange] = useState<{ start: number; end: number } | null>(null);
  const [selectedMatchIdx, setSelectedMatchIdx] = useState(0);
  const [slashOpen, setSlashOpen] = useState(false);
  const [selectedSlashIdx, setSelectedSlashIdx] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slashItemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (composerPrefill !== null) {
      setText(composerPrefill);
      setComposerPrefill(null);
      textareaRef.current?.focus();
    }
  }, [composerPrefill, setComposerPrefill]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const bashMode = useMemo(() => {
    if (text.startsWith('!!')) {
      return { active: true, excludeFromContext: true, command: text.slice(2).trimStart() };
    }
    if (text.startsWith('!')) {
      return { active: true, excludeFromContext: false, command: text.slice(1).trimStart() };
    }
    return { active: false, excludeFromContext: false, command: '' };
  }, [text]);

  useEffect(() => {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? text.length;
    const beforeCursor = text.slice(0, cursor);

    if (text.startsWith('/') && !text.includes('\n') && !text.includes(' ')) {
      setSlashOpen(true);
      setSelectedSlashIdx(0);
      setAtRange(null);
      setFileMatches([]);
      return;
    }
    setSlashOpen(false);

    const atMatch = /(^|\s)@([\w./-]*)$/.exec(beforeCursor);
    if (atMatch && activeSession?.cwd && !bashMode.active) {
      const query = atMatch[2] ?? '';
      const start = cursor - query.length - 1;
      setAtRange({ start, end: cursor });
      setSelectedMatchIdx(0);
      void window.shannon.listWorkspaceFiles(activeSession.cwd, query).then((matches) => {
        setFileMatches(matches);
      });
    } else {
      setAtRange(null);
      setFileMatches([]);
    }
  }, [text, activeSession?.cwd, bashMode.active]);

  const slashCommands = useMemo(() => {
    const merged: SlashCommandItem[] = [...BUILTIN_SLASH_COMMANDS];
    const seen = new Set(merged.map((c) => c.name));

    const dynamic = activeSession?.resources.commands ?? [
      ...(activeSession?.resources.prompts ?? []).map((p) => ({
        name: p.name,
        description: p.description ?? 'Prompt template',
        source: 'prompt' as const,
      })),
      ...(activeSession?.resources.skills ?? []).map((s) => ({
        name: `skill:${s.name}`,
        description: s.description,
        source: 'skill' as const,
      })),
    ];

    for (const cmd of dynamic) {
      if (!seen.has(cmd.name)) {
        seen.add(cmd.name);
        merged.push(cmd);
      }
    }

    const q = text.slice(1).toLowerCase();
    return merged.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.description?.toLowerCase().includes(q) ?? false),
    );
  }, [text, activeSession?.resources]);

  useEffect(() => {
    if (!slashOpen) return;
    slashItemRefs.current[selectedSlashIdx]?.scrollIntoView({ block: 'nearest' });
  }, [slashOpen, selectedSlashIdx]);

  const executeSlashCommand = async (rawName: string, rawArgs: string): Promise<boolean> => {
    const name = rawName.toLowerCase();
    const args = rawArgs.trim();

    switch (name) {
      case 'new': {
        await createNewSession(
          activeSession ? { cwd: activeSession.cwd, projectId: activeSession.projectId } : undefined,
        );
        return true;
      }
      case 'resume': {
        setCommandPaletteOpen(true);
        return true;
      }
      case 'name': {
        if (!activeSession) return true;
        if (!args) {
          pushToast('info', `Current session name: ${activeSession.name || 'New chat'}`);
        } else {
          await renameSession(activeSession.sessionId, args);
          pushToast('info', `Renamed session to "${args}"`);
        }
        return true;
      }
      case 'context':
      case 'session': {
        openInspector('context');
        return true;
      }
      case 'compact': {
        await compactActiveSession(args || undefined);
        return true;
      }
      case 'tree': {
        openInspector('tree');
        return true;
      }
      case 'fork': {
        if (!activeSession) return true;
        const lastUserWithEntry = [...activeSession.messages]
          .reverse()
          .find((m) => m.role === 'user' && Boolean(m.entryId));
        if (!lastUserWithEntry?.entryId) {
          pushToast('warning', 'No persisted user message to fork from yet');
        } else {
          await forkFromEntry(lastUserWithEntry.entryId);
        }
        return true;
      }
      case 'copy': {
        if (!activeSession) return true;
        const lastAssistant = [...activeSession.messages]
          .reverse()
          .find((m) => m.role === 'assistant');
        const content = extractBlocksText(lastAssistant?.blocks);
        if (!content) {
          pushToast('warning', 'No assistant response to copy');
        } else {
          await navigator.clipboard.writeText(content);
          pushToast('info', 'Copied last assistant response');
        }
        return true;
      }
      case 'export': {
        await exportActiveSessionHtml();
        return true;
      }
      case 'model': {
        if (args) {
          const lower = args.toLowerCase();
          const match = availableModels.find(
            (m) =>
              `${m.provider}/${m.id}`.toLowerCase() === lower ||
              m.id.toLowerCase() === lower,
          );
          if (match) {
            await changeModel(match.provider, match.id);
            pushToast('info', `Switched model to ${match.name}`);
            return true;
          }
          setModelSearch(args);
        } else {
          setModelSearch('');
        }
        setModelPickerOpen(true);
        return true;
      }
      case 'thinking': {
        if (!activeSession) return true;
        if (args) {
          const lvl = args.toLowerCase() as ThinkingLevel;
          if (activeSession.availableThinkingLevels.includes(lvl)) {
            await changeThinkingLevel(lvl);
            pushToast('info', `Thinking level set to ${THINKING_LABELS[lvl] ?? lvl}`);
            return true;
          }
        }
        setModelPickerOpen(true);
        return true;
      }
      case 'settings':
      case 'login': {
        setSettingsOpen(true);
        return true;
      }
      case 'resources': {
        openInspector('resources');
        return true;
      }
      case 'reload': {
        await reloadActiveSession();
        return true;
      }
      case 'archive': {
        if (activeSession?.sessionFile) {
          await archiveSessionByPath(activeSession.sessionFile);
        }
        return true;
      }
      default:
        return false;
    }
  };

  const selectSlashCommand = async (cmd: SlashCommandItem) => {
    setSlashOpen(false);
    const requiresArg = cmd.argsHint?.startsWith('<');
    if (cmd.source === 'builtin' && !requiresArg) {
      setText('');
      await executeSlashCommand(cmd.name, '');
      return;
    }
    setText(`/${cmd.name} `);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const insertFileMatch = (match: WorkspaceFileMatch) => {
    if (!atRange) return;
    const before = text.slice(0, atRange.start);
    const after = text.slice(atRange.end);
    setText(`${before}@${match.relativePath} ${after}`);
    setAtRange(null);
    setFileMatches([]);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleSubmit = async (behaviorOverride?: 'steer' | 'followUp') => {
    const trimmed = text.trim();
    if (!trimmed && images.length === 0) return;

    if (bashMode.active) {
      if (!bashMode.command.trim()) return;
      const cmd = bashMode.command;
      const exclude = bashMode.excludeFromContext;
      setText('');
      await runBashCommand(cmd, exclude);
      return;
    }

    if (trimmed.startsWith('/')) {
      const spaceIdx = trimmed.indexOf(' ');
      const cmdName = spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx);
      const cmdArgs = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);
      const handled = await executeSlashCommand(cmdName, cmdArgs);
      if (handled) {
        setText('');
        return;
      }
    }

    const msgImages = images.length > 0 ? [...images] : undefined;
    setText('');
    setImages([]);
    await sendPrompt(trimmed, {
      images: msgImages,
      streamingBehavior: activeSession?.isStreaming ? (behaviorOverride ?? 'steer') : undefined,
    });
  };

  const addImageFiles = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const comma = result.indexOf(',');
        if (comma > -1) {
          setImages((prev) => [
            ...prev,
            {
              type: 'image',
              mimeType: file.type,
              data: result.slice(comma + 1),
            },
          ]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const dt = new DataTransfer();
          dt.items.add(file);
          addImageFiles(dt.files);
        }
      }
    }
  };

  const filteredModels = useMemo(() => {
    const q = modelSearch.trim().toLowerCase();
    return availableModels.filter(
      (m) =>
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.providerName.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q),
    );
  }, [availableModels, modelSearch]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const keyLower = e.key.toLowerCase();

      if (mod && e.shiftKey && keyLower === 'i') {
        e.preventDefault();
        setModelSearch('');
        setModelPickerOpen((prev) => {
          const next = !prev;
          if (next) textareaRef.current?.blur();
          return next;
        });
        return;
      }

      if (mod && e.shiftKey && keyLower === 'e') {
        if (!activeSession || activeSession.availableThinkingLevels.length <= 1) return;
        e.preventDefault();
        const levels = activeSession.availableThinkingLevels;
        const idx = levels.indexOf(activeSession.thinkingLevel);
        const nextLevel = levels[(idx + 1) % levels.length];
        if (nextLevel) {
          void changeThinkingLevel(nextLevel);
        }
        return;
      }

      if (!modelPickerOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        setModelPickerOpen(false);
        setModelSearch('');
        return;
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        const activeTag = document.activeElement?.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
        const target = filteredModels[Number(e.key) - 1];
        if (!target) return;
        e.preventDefault();
        setModelPickerOpen(false);
        setModelSearch('');
        void changeModel(target.provider, target.id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeSession, changeModel, changeThinkingLevel, filteredModels, modelPickerOpen]);

  const activeModelCtxLabel = activeSession?.model
    ? getInlineContextLabel(activeSession.model.name, activeSession.model.contextWindow)
    : '';

  const isStreaming = Boolean(activeSession?.isStreaming);
  const isBashRunning = Boolean(activeSession?.isBashRunning);
  const isBusy = isStreaming || isBashRunning;

  const project = activeSession?.projectId
    ? projects.find((p) => p.id === activeSession.projectId)
    : undefined;
  const workspaceLabel = project
    ? `Local · ${project.name}`
    : activeSession
      ? `Local · ${activeSession.cwd.split('/').filter(Boolean).pop() ?? '~'}`
      : 'Local';

  const breakdown = activeSession?.contextBreakdown;
  const ctxPct = breakdown?.percent ?? 0;
  const ringColor =
    ctxPct >= 85
      ? 'text-red-500'
      : ctxPct >= 60
        ? 'text-amber-500'
        : 'text-[var(--text-secondary)]';

  return (
    <div className="shrink-0 px-5 sm:px-8 pb-3.5 pt-1 bg-[var(--bg-canvas)]">
      <div className="relative mx-auto max-w-[760px]">
        {/* @file Autocomplete Popover */}
        {fileMatches.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-2 max-h-60 overflow-y-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-1.5 shadow-[var(--shadow-popover)] z-30">
            <div className="px-2 py-1 text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Workspace Files
            </div>
            {fileMatches.map((m, idx) => (
              <button
                key={m.relativePath}
                type="button"
                onClick={() => insertFileMatch(m)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] font-mono cursor-pointer ${
                  idx === selectedMatchIdx
                    ? 'bg-[var(--bg-active-row)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                {m.isDirectory ? (
                  <Folder className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                ) : (
                  <FileCode2 className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                )}
                <span className="truncate">{m.relativePath}</span>
              </button>
            ))}
          </div>
        )}

        {/* / Slash Command Popover */}
        {slashOpen && slashCommands.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-2 max-h-72 overflow-y-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-1.5 shadow-[var(--shadow-popover)] z-30">
            <div className="flex items-center justify-between px-2 py-1 text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              <span>Slash Commands ({slashCommands.length})</span>
              <span className="normal-case font-normal">↑↓ navigate · Tab complete · ↵ run</span>
            </div>
            {slashCommands.map((cmd, idx) => (
              <button
                key={`${cmd.source}-${cmd.name}`}
                ref={(el) => {
                  slashItemRefs.current[idx] = el;
                }}
                type="button"
                onClick={() => void selectSlashCommand(cmd)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] cursor-pointer ${
                  idx === selectedSlashIdx
                    ? 'bg-[var(--bg-active-row)]'
                    : 'hover:bg-[var(--bg-hover)]'
                }`}
              >
                <span className="flex items-center gap-1.5 shrink-0 font-mono">
                  <span className="font-medium text-[var(--accent)]">/{cmd.name}</span>
                  {cmd.argsHint && (
                    <span className="text-[11px] text-[var(--text-muted)]">{cmd.argsHint}</span>
                  )}
                </span>
                <span className="flex items-center gap-2 min-w-0">
                  {cmd.description && (
                    <span className="truncate text-[11.5px] text-[var(--text-secondary)]">
                      {cmd.description}
                    </span>
                  )}
                  <span className="shrink-0 rounded bg-[var(--bg-subtle)] px-1.5 py-0.2 text-[10px] text-[var(--text-muted)]">
                    {cmd.source}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Hidden file picker */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => addImageFiles(e.target.files)}
        />

        {/* Capsule Input Container */}
        <div
          className={`rounded-2xl border bg-[var(--bg-surface)] transition-colors ${
            bashMode.active
              ? bashMode.excludeFromContext
                ? 'border-slate-500/60 ring-1 ring-slate-500/20'
                : 'border-amber-500/60 ring-1 ring-amber-500/20'
              : 'border-[var(--border-hairline)] focus-within:border-[var(--border-strong)]'
          }`}
        >
          {bashMode.active && (
            <div
              className={`flex items-center justify-between rounded-t-2xl px-3.5 py-1.5 text-[11.5px] border-b ${
                bashMode.excludeFromContext
                  ? 'bg-[var(--bash-local-bg)] border-slate-500/20 text-[var(--bash-local)]'
                  : 'bg-[var(--bash-in-ctx-bg)] border-amber-500/20 text-[var(--bash-in-ctx)]'
              }`}
            >
              <div className="flex items-center gap-1.5 font-medium">
                <Terminal className="w-3.5 h-3.5" />
                <span>
                  {bashMode.excludeFromContext
                    ? 'Local Bash · 0 context tokens'
                    : 'Bash · Output added to next LLM prompt'}
                </span>
              </div>
              {activeSession && (
                <span className="font-mono text-[11px] opacity-80 truncate max-w-[240px]">
                  {activeSession.cwd}
                </span>
              )}
            </div>
          )}

          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3.5 pt-2.5">
              {images.map((img, i) => (
                <div key={i} className="relative">
                  <img
                    src={`data:${img.mimeType};base64,${img.data}`}
                    alt="upload preview"
                    className="h-12 w-12 rounded-lg border border-[var(--border-hairline)] object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-[var(--text-primary)] p-0.5 text-[var(--bg-canvas)] cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 px-2.5 py-2">
            {/* Left + Button */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setPlusMenuOpen((v) => !v)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                title="Attach or run command"
              >
                <Plus className="w-4 h-4" />
              </button>

              {plusMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setPlusMenuOpen(false)}
                  />
                  <div className="absolute bottom-full left-0 mb-2 w-52 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-elevated)] py-1 shadow-[var(--shadow-popover)] z-40 text-[12.5px]">
                    <button
                      type="button"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        fileInputRef.current?.click();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                    >
                      <ImagePlus className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                      Attach image
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        setText((prev) => `${prev}@`);
                        textareaRef.current?.focus();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                    >
                      <FileCode2 className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                      Reference @file
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        setText('!');
                        textareaRef.current?.focus();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                    >
                      <Terminal className="w-3.5 h-3.5 text-amber-500" />
                      Run !bash (in context)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPlusMenuOpen(false);
                        setText('!!');
                        textareaRef.current?.focus();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                    >
                      <Terminal className="w-3.5 h-3.5 text-slate-400" />
                      Run !!bash (local only)
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (slashOpen && slashCommands.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedSlashIdx((i) => (i + 1) % slashCommands.length);
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedSlashIdx((i) => (i - 1 + slashCommands.length) % slashCommands.length);
                    return;
                  }
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const picked = slashCommands[selectedSlashIdx] ?? slashCommands[0];
                    setText(`/${picked.name} `);
                    setSlashOpen(false);
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const picked = slashCommands[selectedSlashIdx] ?? slashCommands[0];
                    if (picked.source === 'builtin') {
                      void selectSlashCommand(picked);
                    } else if (text.trim().toLowerCase() === `/${picked.name.toLowerCase()}`) {
                      setSlashOpen(false);
                      void handleSubmit();
                    } else {
                      setText(`/${picked.name} `);
                      setSlashOpen(false);
                    }
                    return;
                  }
                  if (e.key === 'Escape') {
                    setSlashOpen(false);
                    return;
                  }
                }

                if (fileMatches.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedMatchIdx((i) => (i + 1) % fileMatches.length);
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedMatchIdx((i) => (i - 1 + fileMatches.length) % fileMatches.length);
                    return;
                  }
                  if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                    e.preventDefault();
                    insertFileMatch(fileMatches[selectedMatchIdx]);
                    return;
                  }
                  if (e.key === 'Escape') {
                    setFileMatches([]);
                    return;
                  }
                }

                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  const queueForLater = isStreaming && (e.metaKey || e.ctrlKey);
                  void handleSubmit(queueForLater ? 'followUp' : 'steer');
                }
              }}
              placeholder={
                isStreaming
                  ? '↵ to send, ⌘↵ to queue for later'
                  : 'Ask anything… (!bash, !!local bash, @file)'
              }
              className={`flex-1 resize-none bg-transparent py-1 text-[13.5px] leading-[1.45] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none ${
                bashMode.active ? 'font-mono text-[13px]' : ''
              }`}
            />

            {/* Right Action Controls */}
            <div className="flex items-center gap-1.5 shrink-0">
              {isBusy && (
                <button
                  type="button"
                  onClick={() => void (isBashRunning ? abortActiveBash() : abortActiveRun())}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] hover:opacity-85 transition-opacity cursor-pointer"
                  title="Stop (Esc)"
                >
                  <Square className="w-3 h-3 fill-current" />
                </button>
              )}

              {(!isBusy || text.trim() || images.length > 0) && (
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={!text.trim() && images.length === 0}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                    bashMode.active
                      ? bashMode.excludeFromContext
                        ? 'bg-slate-600 text-white hover:bg-slate-500'
                        : 'bg-amber-600 text-white hover:bg-amber-500'
                      : 'bg-[var(--bg-active-row)] text-[var(--text-primary)] hover:bg-[var(--accent)] hover:text-white'
                  }`}
                  title={bashMode.active ? 'Run bash command (Enter)' : 'Send (Enter)'}
                >
                  {bashMode.active ? (
                    <Terminal className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowUp className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Metadata Strip (Below Composer Box) */}
        <div className="mt-2 flex items-center justify-between gap-3 px-1.5 text-[12px] text-[var(--text-secondary)]">
          {/* Left: Workspace & Queue Status */}
          <div className="relative flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setWorkspaceMenuOpen((v) => !v)}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] truncate max-w-[240px] cursor-pointer"
              title={activeSession?.cwd}
            >
              <span className="truncate">{workspaceLabel}</span>
              <ChevronDown className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
            </button>

            {workspaceMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setWorkspaceMenuOpen(false)}
                />
                <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-1.5 shadow-[var(--shadow-popover)] z-40 text-[12.5px]">
                  <div className="px-2 py-1 text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Switch Project Workspace
                  </div>
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setWorkspaceMenuOpen(false);
                        void createNewSession({ cwd: p.path, projectId: p.id });
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Folder className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                        <span className="truncate">{p.name}</span>
                      </span>
                      {p.gitBranch && (
                        <span className="font-mono text-[10.5px] text-[var(--text-muted)]">
                          {p.gitBranch}
                        </span>
                      )}
                    </button>
                  ))}
                  <div className="my-1 border-t border-[var(--border-hairline)]" />
                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceMenuOpen(false);
                      void addProject();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[var(--accent)] hover:bg-[var(--bg-hover)] cursor-pointer"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    Add local folder…
                  </button>
                </div>
              </>
            )}

            {activeSession &&
              (activeSession.queuedSteerCount > 0 || activeSession.queuedFollowUpCount > 0) && (
                <span className="text-[11px] text-[var(--accent)]">
                  {activeSession.queuedSteerCount + activeSession.queuedFollowUpCount} queued
                </span>
              )}
          </div>

          {/* Right: Unified Model · Effort · Circular Context Progress Ring */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setModelSearch('');
                  setModelPickerOpen((v) => !v);
                }}
                className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-[12.5px] transition-colors cursor-pointer max-w-[260px] ${
                  modelPickerOpen
                    ? 'bg-[var(--bg-hover)]'
                    : 'hover:bg-[var(--bg-hover)]'
                }`}
              >
                <span className="truncate text-[var(--text-primary)]">
                  {activeSession?.model?.name ?? 'Select model'}
                </span>
                {activeModelCtxLabel && (
                  <span className="shrink-0 text-[var(--text-muted)]">{activeModelCtxLabel}</span>
                )}
                {activeSession && activeSession.availableThinkingLevels.length > 1 && (
                  <>
                    <span className="shrink-0 text-[var(--text-muted)]">·</span>
                    <span className="shrink-0 text-[var(--text-muted)]">
                      {THINKING_LABELS[activeSession.thinkingLevel] ?? activeSession.thinkingLevel}
                    </span>
                  </>
                )}
              </button>

              {modelPickerOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => {
                      setModelPickerOpen(false);
                      setModelSearch('');
                    }}
                  />
                  <div className="absolute bottom-full right-0 mb-2 w-[228px] rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-2 shadow-[var(--shadow-popover)] z-40">
                    {/* Models Header */}
                    <div className="flex items-center justify-between px-2 pt-0.5 pb-1.5">
                      <span className="text-[12px] text-[var(--text-muted)]">Models</span>
                      <span className="flex items-center gap-1">
                        <kbd className={KBD_KEY_CLASS}>⇧</kbd>
                        <kbd className={KBD_KEY_CLASS}>⌘</kbd>
                        <kbd className={KBD_KEY_CLASS}>I</kbd>
                      </span>
                    </div>

                    {modelSearch.trim().length > 0 && (
                      <div className="mx-2 mb-1 flex items-center justify-between rounded-md bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
                        <span className="truncate">Filter: {modelSearch}</span>
                        <button
                          type="button"
                          onClick={() => setModelSearch('')}
                          className="ml-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                          title="Clear filter"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    {/* Models List */}
                    <div className="max-h-[204px] overflow-y-auto space-y-0.5">
                      {filteredModels.length === 0 ? (
                        <div className="px-2 py-3 text-center text-[12px] text-[var(--text-muted)]">
                          No models found.{' '}
                          <button
                            type="button"
                            onClick={() => {
                              setModelPickerOpen(false);
                              setModelSearch('');
                              setSettingsOpen(true);
                            }}
                            className="text-[var(--accent)] underline cursor-pointer"
                          >
                            Open API Settings
                          </button>
                        </div>
                      ) : (
                        filteredModels.map((m, idx) => {
                          const isSelected =
                            activeSession?.model?.provider === m.provider &&
                            activeSession?.model?.id === m.id;
                          const inlineCtx = getInlineContextLabel(m.name, m.contextWindow);
                          return (
                            <button
                              key={`${m.provider}::${m.id}`}
                              type="button"
                              title={`${m.providerName} · ${m.id}`}
                              onClick={() => {
                                setModelPickerOpen(false);
                                setModelSearch('');
                                void changeModel(m.provider, m.id);
                              }}
                              className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-[5px] text-left text-[13px] leading-tight hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                            >
                              <span className="flex items-baseline gap-1.5 min-w-0">
                                <span className="truncate text-[var(--text-primary)]">{m.name}</span>
                                {inlineCtx && (
                                  <span className="shrink-0 text-[12px] text-[var(--text-muted)] tabular-nums">
                                    {inlineCtx}
                                  </span>
                                )}
                              </span>
                              <span className="flex items-center gap-2 shrink-0">
                                {isSelected && (
                                  <Check className="w-3.5 h-3.5 text-[var(--text-primary)]" />
                                )}
                                {idx < 9 && (
                                  <span className="w-2.5 text-right tabular-nums text-[12px] text-[var(--text-muted)]">
                                    {idx + 1}
                                  </span>
                                )}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>

                    {/* Effort Section */}
                    {activeSession && activeSession.availableThinkingLevels.length > 1 && (
                      <>
                        <div className="my-2 mx-2 border-t border-[var(--border-hairline)]" />
                        <div className="flex items-center justify-between px-2 pb-1.5">
                          <span className="text-[12px] text-[var(--text-muted)]">Effort</span>
                          <span className="flex items-center gap-1">
                            <kbd className={KBD_KEY_CLASS}>⇧</kbd>
                            <kbd className={KBD_KEY_CLASS}>⌘</kbd>
                            <kbd className={KBD_KEY_CLASS}>E</kbd>
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          {activeSession.availableThinkingLevels.map((lvl) => {
                            const isActiveLevel = lvl === activeSession.thinkingLevel;
                            return (
                              <button
                                key={lvl}
                                type="button"
                                onClick={() => {
                                  setModelPickerOpen(false);
                                  setModelSearch('');
                                  void changeThinkingLevel(lvl);
                                }}
                                className="flex w-full items-center justify-between rounded-lg px-2 py-[5px] text-left text-[13px] leading-tight hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                              >
                                <span className="text-[var(--text-primary)]">
                                  {THINKING_LABELS[lvl] ?? lvl}
                                </span>
                                {isActiveLevel && (
                                  <Check className="w-3.5 h-3.5 text-[var(--text-primary)]" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Circular Context Progress Ring */}
            {activeSession && (
              <button
                type="button"
                onClick={() => {
                  if (inspectorOpen && inspectorTab === 'context') {
                    closeInspector();
                  } else {
                    openInspector('context');
                  }
                }}
                className="flex items-center justify-center rounded-full p-0.5 hover:bg-[var(--bg-hover)] cursor-pointer"
                title={`Context: ${formatTokenShort(breakdown?.totalTokens)} / ${formatTokenShort(breakdown?.contextWindow)} (${ctxPct}%) — Click to inspect breakdown`}
              >
                <svg className={`w-4 h-4 -rotate-90 ${ringColor}`} viewBox="0 0 20 20">
                  <circle
                    cx="10"
                    cy="10"
                    r="7"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.25"
                    strokeWidth="2.2"
                  />
                  <circle
                    cx="10"
                    cy="10"
                    r="7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeDasharray={`${Math.min(100, ctxPct) * 0.44} 44`}
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
