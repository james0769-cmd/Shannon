import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ChevronDown,
  ChevronRight,
  Copy,
  FolderPlus,
  GitFork,
  Settings,
  Sparkles,
  Terminal,
} from 'lucide-react';
import type { UiMessage, UiMessageBlock } from '@shared/types';
import { mergeToolResults, useAppStore } from '../../stores/app-store.js';
import { AssistantMessageCard } from './AssistantMessageCard.js';
import { BashExecutionCard } from './BashExecutionCard.js';

function renderUserTextWithAtPills(text: string): React.ReactNode {
  const parts = text.split(/(@[\w./-]+)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('@') && part.length > 1) {
      return (
        <span
          key={idx}
          className="inline-block rounded bg-[var(--accent-soft)] px-1.5 py-0.2 font-mono text-[12.5px] text-[var(--accent)]"
        >
          {part}
        </span>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

const CompactionDivider: React.FC<{ message: UiMessage }> = ({ message }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 text-[11.5px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer"
      >
        <div className="h-px flex-1 bg-[var(--border-hairline)]" />
        <span className="flex items-center gap-1 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-0.5">
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {message.role === 'branchSummary' ? 'Branch Summary' : 'Compacted Context'}
          {message.tokensBefore
            ? ` · ${(message.tokensBefore / 1000).toFixed(1)}k tokens before`
            : ''}
        </span>
        <div className="h-px flex-1 bg-[var(--border-hairline)]" />
      </button>
      {open && message.summary && (
        <div className="mt-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3 text-[12.5px] text-[var(--text-secondary)] whitespace-pre-wrap">
          {message.summary}
        </div>
      )}
    </div>
  );
};

export const MessageTimeline: React.FC = () => {
  const {
    activeSession,
    streamingBySession,
    liveToolsBySession,
    liveBashBySession,
    runStartedAtBySession,
    providers,
    highlightedEntryId,
    addProject,
    createNewSession,
    setSettingsOpen,
    forkFromEntry,
    abortActiveBash,
    setComposerPrefill,
  } = useAppStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const sessionId = activeSession?.sessionId ?? '';
  const streaming = sessionId ? streamingBySession[sessionId] : undefined;
  const liveTools = sessionId ? liveToolsBySession[sessionId] : undefined;
  const liveBash = sessionId ? liveBashBySession[sessionId] : undefined;
  const runStartedAt = sessionId ? runStartedAtBySession[sessionId] : undefined;

  const toolResultsMap = useMemo(
    () => (activeSession ? mergeToolResults(activeSession.messages) : new Map()),
    [activeSession?.messages],
  );

  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [
    autoScroll,
    activeSession?.sessionId,
    activeSession?.messages.length,
    streaming?.text,
    streaming?.thinking,
    liveBash?.output,
  ]);

  useEffect(() => {
    if (!highlightedEntryId) return;
    const el = document.getElementById(`entry-${highlightedEntryId}`);
    if (el) {
      setAutoScroll(false);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedEntryId]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScroll(distanceFromBottom < 80);
  };

  const hasAnyAuth = providers.some((p) => p.hasAuth);

  if (!activeSession || (activeSession.messages.length === 0 && !streaming && !liveBash)) {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-10 flex flex-col items-center justify-center">
        <div className="max-w-lg w-full space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto h-10 w-10 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] flex items-center justify-center text-[var(--accent)] text-lg font-bold shadow-[var(--shadow-card)]">
              S
            </div>
            <h1 className="text-[20px] font-semibold tracking-tight text-[var(--text-primary)]">
              {activeSession ? 'Ready to work' : 'Shannon'}
            </h1>
            <p className="text-[13px] text-[var(--text-secondary)]">
              Multi-session Pi Agent workspace with live context breakdown, inline{' '}
              <code className="font-mono text-[12px] bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-hairline)]">
                !bash
              </code>
              , and open API routing.
            </p>
          </div>

          {!hasAnyAuth && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-[12.5px]">
              <span className="text-[var(--text-primary)]">
                No API provider configured yet. Add Anthropic, OpenAI, Ollama, or any compatible proxy.
              </span>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="shrink-0 flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                Configure API
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12.5px]">
            <button
              type="button"
              onClick={() => setComposerPrefill('!git status')}
              className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3.5 text-left hover:border-[var(--border-strong)] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-1.5 font-medium text-[var(--text-primary)] mb-1">
                <Terminal className="w-3.5 h-3.5 text-[var(--bash-in-ctx)]" />
                <code>!cmd</code> &amp; <code>!!cmd</code>
              </div>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                Prefix with <code className="font-mono">!</code> to inject output into context, or{' '}
                <code className="font-mono">!!</code> to run locally at 0 tokens.
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                activeSession
                  ? setComposerPrefill('Summarize the architecture of this workspace.')
                  : void addProject()
              }
              className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3.5 text-left hover:border-[var(--border-strong)] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-1.5 font-medium text-[var(--text-primary)] mb-1">
                {activeSession ? (
                  <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                ) : (
                  <FolderPlus className="w-3.5 h-3.5 text-[var(--accent)]" />
                )}
                {activeSession ? 'Inspect Workspace' : 'Open a Project'}
              </div>
              <p className="text-[var(--text-secondary)] leading-relaxed truncate">
                {activeSession
                  ? activeSession.cwd
                  : 'Group threads by repository and autocomplete files with @.'}
              </p>
            </button>
          </div>

          {!activeSession && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => void createNewSession()}
                className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-2 text-[12.5px] font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] cursor-pointer"
              >
                New Session
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const streamingBlocks: UiMessageBlock[] = [];
  if (streaming) {
    if (streaming.thinking) streamingBlocks.push({ type: 'thinking', thinking: streaming.thinking });
    if (streaming.text) streamingBlocks.push({ type: 'text', text: streaming.text });
    for (const tc of streaming.toolCalls) {
      streamingBlocks.push({
        type: 'toolCall',
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      });
    }
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-5 sm:px-8 py-6"
      >
        <div className="mx-auto max-w-[760px] space-y-1.5">
          {activeSession.messages.map((msg) => {
            if (msg.role === 'toolResult') return null;

            const isHighlighted = Boolean(msg.entryId && msg.entryId === highlightedEntryId);
            const highlightClass = isHighlighted
              ? 'ring-2 ring-[var(--accent)] rounded-2xl transition-all'
              : '';

            if (msg.role === 'compactionSummary' || msg.role === 'branchSummary') {
              return (
                <div
                  key={msg.id}
                  id={msg.entryId ? `entry-${msg.entryId}` : undefined}
                  className={highlightClass}
                >
                  <CompactionDivider message={msg} />
                </div>
              );
            }

            if (msg.role === 'bashExecution' && msg.bash) {
              return (
                <div
                  key={msg.id}
                  id={msg.entryId ? `entry-${msg.entryId}` : undefined}
                  className={highlightClass}
                >
                  <BashExecutionCard
                    command={msg.bash.command}
                    output={msg.bash.output}
                    excludeFromContext={msg.bash.excludeFromContext}
                    exitCode={msg.bash.exitCode}
                    cancelled={msg.bash.cancelled}
                    truncated={msg.bash.truncated}
                    fullOutputPath={msg.bash.fullOutputPath}
                  />
                </div>
              );
            }

            if (msg.role === 'user') {
              return (
                <div
                  key={msg.id}
                  id={msg.entryId ? `entry-${msg.entryId}` : undefined}
                  className={`group flex justify-end pt-3 pb-1 ${highlightClass}`}
                >
                  <div className="max-w-[82%] space-y-1">
                    <div className="rounded-2xl border border-[var(--border-user-bubble)] bg-[var(--bg-user-bubble)] px-4 py-2.5 text-[14px] leading-relaxed text-[var(--text-user-bubble)] whitespace-pre-wrap break-words">
                      {msg.images && msg.images.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-2">
                          {msg.images.map((img, i) => (
                            <img
                              key={i}
                              src={`data:${img.mimeType};base64,${img.data}`}
                              alt="attachment"
                              className="max-h-48 rounded-lg border border-[var(--border-hairline)] object-contain"
                            />
                          ))}
                        </div>
                      )}
                      {renderUserTextWithAtPills(msg.text || '')}
                    </div>

                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => void navigator.clipboard.writeText(msg.text || '')}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        Copy
                      </button>
                      {msg.entryId && (
                        <button
                          type="button"
                          onClick={() => void forkFromEntry(msg.entryId!)}
                          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          <GitFork className="w-3 h-3" />
                          Fork
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            if (msg.role === 'assistant') {
              return (
                <div
                  key={msg.id}
                  id={msg.entryId ? `entry-${msg.entryId}` : undefined}
                  className={highlightClass}
                >
                  <AssistantMessageCard
                    blocks={msg.blocks ?? []}
                    toolResultsMap={toolResultsMap}
                    liveTools={liveTools}
                    errorMessage={msg.errorMessage}
                    stopReason={msg.stopReason}
                  />
                </div>
              );
            }

            if (msg.role === 'custom' && msg.text) {
              return (
                <div
                  key={msg.id}
                  className="my-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2 text-[12.5px] text-[var(--text-secondary)]"
                >
                  {msg.text}
                </div>
              );
            }

            return null;
          })}

          {/* Streaming Assistant Turn OR Active Run Indicator */}
          {(streaming || activeSession.isStreaming) && (
            <AssistantMessageCard
              blocks={streamingBlocks}
              toolResultsMap={toolResultsMap}
              liveTools={liveTools}
              isStreaming
              runStartedAt={runStartedAt}
            />
          )}

          {/* Active !bash execution */}
          {liveBash && !liveBash.done && (
            <BashExecutionCard
              command={liveBash.command}
              output={liveBash.output}
              excludeFromContext={liveBash.excludeFromContext}
              isRunning
              onAbort={() => void abortActiveBash()}
            />
          )}
        </div>
      </div>

      {!autoScroll && (
        <button
          type="button"
          onClick={() => {
            setAutoScroll(true);
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
          }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1 text-[12px] font-medium text-[var(--text-primary)] shadow-[var(--shadow-popover)] hover:bg-[var(--bg-hover)] cursor-pointer"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          Jump to bottom
        </button>
      )}
    </div>
  );
};
