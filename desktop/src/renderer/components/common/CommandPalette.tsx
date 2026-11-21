import React, { useMemo, useState } from 'react';
import { FolderGit2, MessageSquare, Search, X } from 'lucide-react';
import { useAppStore } from '../../stores/app-store.js';

export const CommandPalette: React.FC = () => {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    projects,
    sessions,
    createNewSession,
    openSessionByPath,
  } = useAppStore();

  const [query, setQuery] = useState('');

  const { matchedProjects, matchedSessions } = useMemo(() => {
    const q = query.trim().toLowerCase();
    return {
      matchedProjects: projects.filter(
        (p) => !q || p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q),
      ),
      matchedSessions: sessions
        .filter(
          (s) =>
            !q ||
            s.name.toLowerCase().includes(q) ||
            s.firstMessage.toLowerCase().includes(q) ||
            s.cwd.toLowerCase().includes(q),
        )
        .slice(0, 20),
    };
  }, [query, projects, sessions]);

  if (!commandPaletteOpen) return null;

  const close = () => {
    setQuery('');
    setCommandPaletteOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[14vh] px-4"
      onClick={close}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-elevated)] shadow-[var(--shadow-popover)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--border-hairline)] px-4 py-3">
          <Search className="w-4 h-4 text-[var(--text-muted)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
            }}
            placeholder="Jump to a project or chat…"
            className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
          />
          <button
            type="button"
            onClick={close}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2 space-y-3">
          {matchedProjects.length > 0 && (
            <div>
              <div className="px-2.5 pb-1 text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                New Chat in Project
              </div>
              {matchedProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    close();
                    void createNewSession({ cwd: p.path, projectId: p.id });
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-[var(--bg-hover)] cursor-pointer"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <FolderGit2 className="w-4 h-4 text-[var(--accent)] shrink-0" />
                    <span className="font-medium text-[var(--text-primary)] truncate">
                      {p.name}
                    </span>
                  </span>
                  <span className="truncate font-mono text-[11px] text-[var(--text-muted)] max-w-[220px]">
                    {p.path}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div>
            <div className="px-2.5 pb-1 text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Recent Chats
            </div>
            {matchedSessions.length === 0 ? (
              <div className="px-3 py-4 text-center text-[12.5px] text-[var(--text-muted)]">
                No matching chats
              </div>
            ) : (
              matchedSessions.map((s) => (
                <button
                  key={s.path}
                  type="button"
                  onClick={() => {
                    close();
                    void openSessionByPath(s.path);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-[var(--bg-hover)] cursor-pointer"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <MessageSquare className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                    <span className="truncate text-[var(--text-primary)]">{s.name}</span>
                  </span>
                  <span className="truncate font-mono text-[11px] text-[var(--text-muted)] max-w-[180px]">
                    {s.cwd.split('/').filter(Boolean).pop()}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
