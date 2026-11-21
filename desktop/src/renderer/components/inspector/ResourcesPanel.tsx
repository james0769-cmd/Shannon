import React from 'react';
import { FileText, Sparkles, Wrench } from 'lucide-react';
import { useAppStore } from '../../stores/app-store.js';

export const ResourcesPanel: React.FC = () => {
  const { activeSession } = useAppStore();
  const resources = activeSession?.resources;

  if (!resources) return null;

  return (
    <div className="p-4 space-y-5 text-[12.5px]">
      {/* AGENTS.md / CLAUDE.md */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          <FileText className="w-3.5 h-3.5" />
          <span>Context Instructions ({resources.agentsFiles.length})</span>
        </div>
        {resources.agentsFiles.length === 0 ? (
          <div className="text-[12px] text-[var(--text-muted)]">
            No AGENTS.md or CLAUDE.md files loaded for this workspace.
          </div>
        ) : (
          <div className="space-y-1.5">
            {resources.agentsFiles.map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={() => window.shannon.revealInFinder(f.path)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-left hover:border-[var(--border-strong)] cursor-pointer"
              >
                <span className="truncate font-mono text-[11.5px] text-[var(--text-primary)]">
                  {f.path}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-[var(--text-muted)]">
                  ~{f.tokens} tok
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Skills */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Skills ({resources.skills.length})</span>
        </div>
        {resources.skills.length === 0 ? (
          <div className="text-[12px] text-[var(--text-muted)]">No skills discovered.</div>
        ) : (
          <div className="space-y-1.5">
            {resources.skills.map((s) => (
              <div
                key={s.filePath}
                className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2"
              >
                <div className="font-mono text-[12px] font-medium text-[var(--accent)]">
                  /skill:{s.name}
                </div>
                <div className="mt-0.5 text-[11.5px] text-[var(--text-secondary)]">
                  {s.description}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tools */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          <Wrench className="w-3.5 h-3.5" />
          <span>
            Active Tools ({resources.tools.filter((t) => t.active).length}/{resources.tools.length})
          </span>
        </div>
        <div className="space-y-1">
          {resources.tools.map((t) => (
            <div
              key={t.name}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5"
            >
              <span className="truncate font-mono text-[11.5px] text-[var(--text-primary)]">
                {t.name}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  t.active
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                }`}
              >
                {t.source === 'mcp' ? `mcp:${t.mcpServer}` : t.source}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
