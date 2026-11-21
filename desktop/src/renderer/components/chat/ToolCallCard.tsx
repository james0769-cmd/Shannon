import React, { useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderSearch,
  Loader2,
  Pencil,
  Terminal,
  Wrench,
  XCircle,
} from 'lucide-react';
import type { UiMessage } from '@shared/types';
import type { LiveToolExecution } from '../../stores/app-store.js';

interface ToolCallCardProps {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: UiMessage;
  live?: LiveToolExecution;
}

function summarizeToolCall(name: string, args: Record<string, unknown>): string {
  const path = typeof args.path === 'string' ? args.path : undefined;
  if (name === 'read' && path) return `Read ${path}`;
  if (name === 'edit' && path) return `Edit ${path}`;
  if (name === 'write' && path) return `Write ${path}`;
  if (name === 'bash' && typeof args.command === 'string') {
    return `$ ${args.command.slice(0, 72)}`;
  }
  if (name === 'grep' && typeof args.pattern === 'string') {
    return `Grep "${args.pattern}"`;
  }
  if (name === 'find' && typeof args.pattern === 'string') {
    return `Find ${args.pattern}`;
  }
  if (name === 'ls') return `List ${path ?? '.'}`;
  if (name.startsWith('mcp__')) {
    const parts = name.slice(5).split('__');
    return `MCP · ${parts.join(' / ')}`;
  }
  return name;
}

function renderToolIcon(name: string) {
  if (name === 'read' || name === 'write') return <FileText className="w-3.5 h-3.5" />;
  if (name === 'edit') return <Pencil className="w-3.5 h-3.5" />;
  if (name === 'bash' || name === 'powershell') return <Terminal className="w-3.5 h-3.5" />;
  if (name === 'grep' || name === 'find' || name === 'ls') return <FolderSearch className="w-3.5 h-3.5" />;
  return <Wrench className="w-3.5 h-3.5" />;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({
  toolName,
  args,
  result,
  live,
}) => {
  const [expanded, setExpanded] = useState(false);

  const isRunning = Boolean(live && live.phase !== 'end' && !result);
  const isError = result ? Boolean(result.isError) : Boolean(live?.isError);
  const outputText = result?.text ?? live?.resultText ?? live?.partialText ?? '';
  const details = result?.details ?? live?.details;
  const diffText =
    toolName === 'edit' && details && typeof details.diff === 'string' ? details.diff : undefined;

  return (
    <div className="my-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] hover:bg-[var(--bg-subtle)]/60 transition-colors cursor-pointer"
      >
        <span className="text-[var(--text-muted)] shrink-0">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
        <span className="text-[var(--text-secondary)] shrink-0">{renderToolIcon(toolName)}</span>
        <span className="flex-1 truncate font-mono text-[12px] text-[var(--text-primary)]">
          {summarizeToolCall(toolName, args)}
        </span>
        <span className="shrink-0">
          {isRunning ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
          ) : isError ? (
            <XCircle className="w-3.5 h-3.5 text-red-500" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-[var(--border-hairline)] bg-[var(--bg-canvas)]/70 p-3 space-y-2 text-[12px]">
          <div>
            <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Arguments
            </div>
            <pre className="overflow-x-auto rounded border border-[var(--border-hairline)] bg-[var(--code-bg)] p-2 font-mono text-[11.5px] text-[var(--text-secondary)] max-h-44">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>

          {diffText && (
            <div>
              <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Diff
              </div>
              <pre className="overflow-x-auto rounded border border-[var(--border-hairline)] bg-[var(--code-bg)] p-2 font-mono text-[11.5px] max-h-64">
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
            </div>
          )}

          {outputText && (
            <div>
              <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Output
              </div>
              <pre
                className={`overflow-x-auto rounded border p-2 font-mono text-[11.5px] max-h-64 whitespace-pre-wrap break-words ${
                  isError
                    ? 'border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400'
                    : 'border-[var(--border-hairline)] bg-[var(--code-bg)] text-[var(--text-primary)]'
                }`}
              >
                {outputText}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
