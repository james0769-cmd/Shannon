import React, { useMemo, useState } from 'react';
import Convert from 'ansi-to-html';
import { Check, Copy, ExternalLink, Loader2, Square, Terminal } from 'lucide-react';

interface BashExecutionCardProps {
  command: string;
  output: string;
  excludeFromContext: boolean;
  exitCode?: number;
  cancelled?: boolean;
  truncated?: boolean;
  fullOutputPath?: string;
  isRunning?: boolean;
  onAbort?: () => void;
}

const ansiConverter = new Convert({
  fg: '#E4E4E7',
  bg: '#141416',
  newline: false,
  escapeXML: true,
});

export const BashExecutionCard: React.FC<BashExecutionCardProps> = ({
  command,
  output,
  excludeFromContext,
  exitCode,
  cancelled,
  truncated,
  fullOutputPath,
  isRunning,
  onAbort,
}) => {
  const [copied, setCopied] = useState(false);

  const html = useMemo(() => {
    if (!output) return '';
    return ansiConverter.toHtml(output);
  }, [output]);

  const handleCopy = () => {
    void navigator.clipboard.writeText(output || command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={`my-2.5 overflow-hidden rounded-xl border ${
        excludeFromContext
          ? 'border-slate-500/35'
          : 'border-amber-500/40'
      } bg-[#141416] text-[#E4E4E7]`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-[#1B1B1E] px-3.5 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Terminal
            className={`w-3.5 h-3.5 shrink-0 ${
              excludeFromContext ? 'text-slate-400' : 'text-amber-400'
            }`}
          />
          <code className="truncate font-mono text-[12.5px] text-[#F4F4F5]">
            {excludeFromContext ? '!!' : '!'} {command}
          </code>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
              excludeFromContext
                ? 'bg-slate-500/20 text-slate-300'
                : 'bg-amber-500/20 text-amber-300'
            }`}
            title={
              excludeFromContext
                ? 'Executed locally only (0 context tokens)'
                : 'Output included in next LLM turn context'
            }
          >
            {excludeFromContext ? 'Local Only · 0 tokens' : 'In Context'}
          </span>

          {isRunning ? (
            <div className="flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              {onAbort && (
                <button
                  type="button"
                  onClick={onAbort}
                  className="flex items-center gap-1 rounded bg-red-500/20 px-2 py-0.5 text-[11px] text-red-300 hover:bg-red-500/30 cursor-pointer"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                  Stop
                </button>
              )}
            </div>
          ) : cancelled ? (
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10.5px] font-mono text-zinc-300">
              cancelled
            </span>
          ) : exitCode !== undefined ? (
            <span
              className={`rounded px-1.5 py-0.5 text-[10.5px] font-mono ${
                exitCode === 0
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-red-500/20 text-red-300'
              }`}
            >
              exit {exitCode}
            </span>
          ) : null}

          <button
            type="button"
            onClick={handleCopy}
            className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 cursor-pointer"
            title="Copy output"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto px-3.5 py-2.5 font-mono text-[12px] leading-[1.55]">
        {output ? (
          <pre
            className="m-0 whitespace-pre-wrap break-words"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : isRunning ? (
          <span className="text-zinc-400 italic">Running command…</span>
        ) : (
          <span className="text-zinc-500 italic">(no output)</span>
        )}
      </div>

      {truncated && fullOutputPath && (
        <div className="flex items-center justify-between border-t border-white/10 bg-[#1B1B1E] px-3.5 py-1.5 text-[11.5px] text-zinc-300">
          <span>Output truncated for context safety</span>
          <button
            type="button"
            onClick={() => void window.shannon.openPath(fullOutputPath)}
            className="flex items-center gap-1 text-amber-300 hover:underline cursor-pointer"
          >
            Open Full Log
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};
