import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  XCircle,
} from 'lucide-react';
import type { UiMessage, UiMessageBlock } from '@shared/types';
import type { LiveToolExecution } from '../../stores/app-store.js';

interface AssistantMessageCardProps {
  blocks: UiMessageBlock[];
  toolResultsMap: Map<string, UiMessage>;
  liveTools?: Record<string, LiveToolExecution>;
  isStreaming?: boolean;
  runStartedAt?: number;
  errorMessage?: string;
  stopReason?: string;
}

function summarizeToolAction(
  name: string,
  args: Record<string, unknown>,
  inProgress: boolean,
): string {
  const path = typeof args.path === 'string' ? args.path : undefined;
  const shortPath = path ? path.split('/').slice(-2).join('/') : undefined;
  if (name === 'read') {
    return `${inProgress ? 'Reading' : 'Read'} ${shortPath ?? 'file'}`;
  }
  if (name === 'edit') {
    return `${inProgress ? 'Editing' : 'Edited'} ${shortPath ?? 'file'}`;
  }
  if (name === 'write') {
    return `${inProgress ? 'Writing' : 'Wrote'} ${shortPath ?? 'file'}`;
  }
  if (name === 'bash' && typeof args.command === 'string') {
    return `${inProgress ? 'Running' : 'Ran'} \`${args.command.slice(0, 56)}\``;
  }
  if (name === 'grep' && typeof args.pattern === 'string') {
    return `${inProgress ? 'Searching' : 'Searched'} "${args.pattern}"`;
  }
  if (name === 'find' && typeof args.pattern === 'string') {
    return `${inProgress ? 'Finding' : 'Found'} ${args.pattern}`;
  }
  if (name === 'ls') {
    return `${inProgress ? 'Listing' : 'Listed'} ${shortPath ?? '.'}`;
  }
  if (name.startsWith('mcp__')) {
    return name.slice(5).replace(/__/g, ' · ');
  }
  return name;
}

const CodeBlock: React.FC<{ className?: string; children?: React.ReactNode }> = ({
  className,
  children,
}) => {
  const [copied, setCopied] = useState(false);
  const code = String(children ?? '').replace(/\n$/, '');
  const langMatch = /language-([\w-]+)/.exec(className || '');
  const lang = langMatch?.[1];

  const highlighted = useMemo(() => {
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    } catch {
      return code;
    }
  }, [code, lang]);

  const isInline = !className && !code.includes('\n');
  if (isInline) {
    return <code>{children}</code>;
  }

  return (
    <div className="my-2.5 overflow-hidden rounded-lg border border-[var(--code-border)] bg-[var(--code-bg)]">
      <div className="flex items-center justify-between border-b border-[var(--code-border)] px-3 py-1 text-[11px] text-[var(--text-muted)]">
        <span className="font-mono">{lang || 'text'}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="m-0 overflow-x-auto p-3 text-[12.5px] leading-[1.55] font-mono">
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  );
};

interface ToolCallItem {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

const ToolChecklistGroup: React.FC<{
  calls: ToolCallItem[];
  toolResultsMap: Map<string, UiMessage>;
  liveTools?: Record<string, LiveToolExecution>;
}> = ({ calls, toolResultsMap, liveTools }) => {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  if (calls.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)]/55 px-3 py-2 space-y-1">
      {calls.map((tc, idx) => {
        const result = toolResultsMap.get(tc.id);
        const live = liveTools?.[tc.id];
        const isRunning = Boolean(live && live.phase !== 'end' && !result);
        const isError = result ? Boolean(result.isError) : Boolean(live?.isError);
        const isExpanded = Boolean(expandedIds[tc.id]);
        const outputText = result?.text ?? live?.resultText ?? live?.partialText ?? '';
        const details = result?.details ?? live?.details;
        const diffText =
          tc.name === 'edit' && details && typeof details.diff === 'string'
            ? details.diff
            : undefined;

        return (
          <div key={tc.id || idx} className="text-[12.5px]">
            <button
              type="button"
              onClick={() =>
                setExpandedIds((s) => ({ ...s, [tc.id]: !isExpanded }))
              }
              className="flex w-full items-center gap-2.5 py-0.5 text-left group cursor-pointer"
            >
              {isRunning ? (
                <span className="h-3.5 w-3.5 rounded-full border border-dashed border-[var(--text-secondary)] animate-spin shrink-0" />
              ) : isError ? (
                <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
              )}

              <span
                className={`flex-1 truncate ${
                  isRunning
                    ? 'text-[var(--text-primary)] font-medium'
                    : isError
                      ? 'text-red-500'
                      : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
                }`}
              >
                {summarizeToolAction(tc.name, tc.arguments, isRunning)}
              </span>

              <span className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </span>
            </button>

            {isExpanded && (
              <div className="mt-2 ml-6 space-y-2 border-l border-[var(--border-hairline)] pl-3 pb-1 text-[11.5px]">
                <pre className="overflow-x-auto rounded-lg border border-[var(--border-hairline)] bg-[var(--code-bg)] p-2 font-mono text-[var(--text-secondary)] max-h-36">
                  {JSON.stringify(tc.arguments, null, 2)}
                </pre>

                {diffText && (
                  <pre className="overflow-x-auto rounded-lg border border-[var(--border-hairline)] bg-[var(--code-bg)] p-2 font-mono max-h-56">
                    {diffText.split('\n').map((line, i) => {
                      const cls = line.startsWith('+')
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : line.startsWith('-')
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-[var(--text-secondary)]';
                      return (
                        <div key={i} className={cls}>
                          {line}
                        </div>
                      );
                    })}
                  </pre>
                )}

                {outputText && (
                  <pre
                    className={`overflow-x-auto rounded-lg border p-2 font-mono max-h-56 whitespace-pre-wrap break-words ${
                      isError
                        ? 'border-red-500/30 bg-red-500/5 text-red-500'
                        : 'border-[var(--border-hairline)] bg-[var(--code-bg)] text-[var(--text-primary)]'
                    }`}
                  >
                    {outputText}
                  </pre>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const AssistantMessageCard: React.FC<AssistantMessageCardProps> = ({
  blocks,
  toolResultsMap,
  liveTools,
  isStreaming,
  runStartedAt,
  errorMessage,
  stopReason,
}) => {
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!isStreaming || !runStartedAt) {
      setElapsedSec(0);
      return;
    }
    const update = () => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - runStartedAt) / 1000)));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [isStreaming, runStartedAt]);

  const thinkingText = useMemo(
    () =>
      blocks
        .filter((b): b is { type: 'thinking'; thinking: string } => b.type === 'thinking')
        .map((b) => b.thinking)
        .join('\n\n')
        .trim(),
    [blocks],
  );

  const textSegments = useMemo(
    () =>
      blocks
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text' && Boolean(b.text))
        .map((b) => b.text),
    [blocks],
  );

  const toolCalls = useMemo(
    () =>
      blocks.filter(
        (b): b is { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> } =>
          b.type === 'toolCall',
      ),
    [blocks],
  );

  const activeTool = useMemo(() => {
    if (!liveTools) return undefined;
    return Object.values(liveTools).find((t) => t.phase !== 'end');
  }, [liveTools]);

  const activityLabel = useMemo(() => {
    if (activeTool) {
      return summarizeToolAction(activeTool.toolName, activeTool.args ?? {}, true);
    }
    if (thinkingText && textSegments.length === 0) return 'Thinking';
    return 'Working';
  }, [activeTool, thinkingText, textSegments.length]);

  const fullText = textSegments.join('\n');

  return (
    <div className="group py-0.5 space-y-1.5">
      {/* Collapsible Thought Process (always placed ABOVE formal output) */}
      {thinkingText && (
        <div className="px-1">
          <button
            type="button"
            onClick={() => setTraceOpen((v) => !v)}
            className="inline-flex items-center gap-2 text-[12.5px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer"
          >
            {isStreaming && textSegments.length === 0 && !activeTool && (
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shannon-dot-1" />
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shannon-dot-2" />
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shannon-dot-3" />
              </span>
            )}
            <span>
              {isStreaming && textSegments.length === 0 && !activeTool
                ? `Thinking…${elapsedSec > 0 ? `  ${elapsedSec}s` : ''}`
                : 'Thought process'}
            </span>
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform ${
                traceOpen ? 'rotate-90' : ''
              }`}
            />
          </button>

          {traceOpen && (
            <div className="mt-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)]/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">
              {thinkingText}
            </div>
          )}
        </div>
      )}

      {/* Assistant prose rendered directly on canvas without outer card */}
      {textSegments.length > 0 && (
        <div className="relative px-1">
          {!isStreaming && fullText && (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(fullText);
                setCopiedMsg(true);
                setTimeout(() => setCopiedMsg(false), 1500);
              }}
              className="absolute right-0 top-0 z-10 inline-flex items-center gap-1 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)]/90 px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-opacity cursor-pointer"
            >
              {copiedMsg ? (
                <Check className="w-3 h-3 text-emerald-500" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              <span>{copiedMsg ? 'Copied' : 'Copy'}</span>
            </button>
          )}

          <div className="shannon-prose">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code: CodeBlock as never,
                a: ({ href, children }) => (
                  <a
                    href={href}
                    onClick={(e) => {
                      e.preventDefault();
                      if (href) void window.shannon.openExternal(href);
                    }}
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {fullText}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Bordered Checklist for Tool Calls */}
      {toolCalls.length > 0 && (
        <ToolChecklistGroup
          calls={toolCalls}
          toolResultsMap={toolResultsMap}
          liveTools={liveTools}
        />
      )}

      {/* Live Activity Row ("••• Editing ProductCard.tsx 18s") shown only during active non-thinking work */}
      {isStreaming && (textSegments.length > 0 || activeTool || !thinkingText) && (
        <div className="px-1">
          <div className="inline-flex items-center gap-2 text-[12.5px] text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shannon-dot-1" />
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shannon-dot-2" />
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shannon-dot-3" />
            </span>
            <span>
              {`${activityLabel}${elapsedSec > 0 ? `  ${elapsedSec}s` : ''}`}
            </span>
          </div>
        </div>
      )}

      {stopReason === 'error' && errorMessage && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[12.5px] text-red-500">
          {errorMessage}
        </div>
      )}
    </div>
  );
};
