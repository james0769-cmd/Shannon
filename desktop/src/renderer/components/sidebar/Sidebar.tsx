import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Briefcase,
  Check,
  Edit3,
  Folder,
  FolderOpen,
  FolderPlus,
  ListFilter,
  Monitor,
  Moon,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Settings,
  Sun,
  Trash2,
} from 'lucide-react';
import type { SessionSummary, ThemeMode } from '@shared/types';
import { SIDEBAR_WIDTH_DEFAULT, useAppStore } from '../../stores/app-store.js';

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type SessionFilterMode = 'all' | 'working' | 'needs_input';
type SessionSortMode = 'recent' | 'name';

interface SidebarSessionRowProps {
  session: SessionSummary;
  isActive: boolean;
  isRunning: boolean;
  needsInput: boolean;
  isArchivedView?: boolean;
  indented?: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
  onReveal: () => void;
}

const SidebarSessionRow: React.FC<SidebarSessionRowProps> = ({
  session,
  isActive,
  isRunning,
  needsInput,
  isArchivedView,
  indented,
  onSelect,
  onRename,
  onArchiveToggle,
  onDelete,
  onReveal,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.name);

  const commitRename = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== session.name) {
      onRename(draft.trim());
    }
  };

  return (
    <div
      onClick={() => {
        if (!editing) onSelect();
      }}
      className={`group relative flex items-center gap-2 rounded-lg py-[6px] pr-2.5 text-[13px] leading-5 cursor-pointer transition-colors ${
        indented ? 'pl-6' : 'px-2.5'
      } ${
        isActive
          ? 'bg-[var(--bg-active-row)] text-[var(--text-primary)] font-medium'
          : 'text-[var(--text-primary)]/90 hover:bg-[var(--bg-hover)]'
      }`}
    >
      {isRunning ? (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)] animate-pulse"
          title="Working"
        />
      ) : needsInput ? (
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
      ) : null}

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') {
              setDraft(session.name);
              setEditing(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 rounded border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-1.5 py-0.5 text-[12.5px] text-[var(--text-primary)] outline-none"
        />
      ) : (
        <span className="flex-1 truncate">{session.name}</span>
      )}

      {/* Right timestamp (swaps to action buttons on hover) */}
      <span className="shrink-0 text-[11.5px] text-[var(--text-muted)] group-hover:hidden">
        {formatRelativeTime(session.modified)}
      </span>

      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
        {isArchivedView && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onArchiveToggle();
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] cursor-pointer"
            title="Restore to Code"
          >
            <ArchiveRestore className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>

      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
            }}
          />
          <div
            className="absolute right-1 top-8 z-40 w-44 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-elevated)] py-1 shadow-[var(--shadow-popover)] text-[12.5px]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
              onClick={() => {
                setMenuOpen(false);
                setDraft(session.name);
                setEditing(true);
              }}
            >
              <Edit3 className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              Rename
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
              onClick={() => {
                setMenuOpen(false);
                onArchiveToggle();
              }}
            >
              {isArchivedView ? (
                <ArchiveRestore className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              ) : (
                <Archive className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              )}
              {isArchivedView ? 'Restore to Code' : 'Archive'}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
              onClick={() => {
                setMenuOpen(false);
                onReveal();
              }}
            >
              <FolderOpen className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              Reveal JSONL
            </button>
            <div className="my-1 border-t border-[var(--border-hairline)]" />
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-red-500 hover:bg-[var(--bg-hover)] cursor-pointer"
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete chat
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export const Sidebar: React.FC = () => {
  const {
    sidebarCollapsed,
    sidebarWidth,
    setSidebarWidth,
    sidebarView,
    projects,
    sessions,
    activeSession,
    providers,
    needsInputBySession,
    theme,
    setTheme,
    addProject,
    removeProject,
    togglePinProject,
    createNewSession,
    openSessionByPath,
    archiveSessionByPath,
    unarchiveSessionByPath,
    deleteSessionByPath,
    renameSession,
    openInspector,
    setSettingsOpen,
    setCommandPaletteOpen,
  } = useAppStore();

  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [filterMode, setFilterMode] = useState<SessionFilterMode>('all');
  const [sortMode, setSortMode] = useState<SessionSortMode>('recent');
  const [showAllConversations, setShowAllConversations] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = sidebarWidth;
      setIsResizing(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (moveEvent: MouseEvent) => {
        setSidebarWidth(startWidth + (moveEvent.clientX - startX));
      };

      const onMouseUp = () => {
        setIsResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [sidebarWidth, setSidebarWidth],
  );

  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  const hasAnyAuth = useMemo(() => providers.some((p) => p.hasAuth), [providers]);

  const { sessionsByProject, standaloneConversations, archivedSessions } = useMemo(() => {
    const projectMap = new Map<string, SessionSummary[]>();
    for (const p of projects) projectMap.set(p.id, []);

    const standalone: SessionSummary[] = [];
    const archived: SessionSummary[] = [];

    const sortList = (list: SessionSummary[]) => {
      if (sortMode === 'name') {
        return [...list].sort((a, b) => a.name.localeCompare(b.name));
      }
      return [...list].sort(
        (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime(),
      );
    };

    const matchesFilter = (s: SessionSummary) => {
      const isRunning =
        s.isRunning ||
        (activeSession?.sessionId === s.id &&
          (activeSession.isStreaming || activeSession.isBashRunning));
      const needsInput = Boolean(s.needsInput || needsInputBySession[s.id]);
      if (filterMode === 'working') return isRunning;
      if (filterMode === 'needs_input') return needsInput;
      return true;
    };

    for (const s of sessions) {
      if (s.archived) {
        archived.push(s);
        continue;
      }
      if (!matchesFilter(s)) continue;

      if (s.projectId && projectMap.has(s.projectId)) {
        projectMap.get(s.projectId)!.push(s);
      } else {
        standalone.push(s);
      }
    }

    for (const [id, list] of projectMap.entries()) {
      projectMap.set(id, sortList(list));
    }

    return {
      sessionsByProject: projectMap,
      standaloneConversations: sortList(standalone),
      archivedSessions: sortList(archived),
    };
  }, [sessions, projects, activeSession, needsInputBySession, filterMode, sortMode]);

  if (sidebarCollapsed) return null;

  const cycleTheme = () => {
    const order: ThemeMode[] = ['dark', 'light', 'system'];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    void setTheme(next);
  };

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const visibleStandalone = showAllConversations
    ? standaloneConversations
    : standaloneConversations.slice(0, 12);

  const isSessionRunning = (s: SessionSummary) =>
    Boolean(
      s.isRunning ||
        (activeSession?.sessionId === s.id &&
          (activeSession.isStreaming || activeSession.isBashRunning)),
    );

  const isSessionNeedsInput = (s: SessionSummary) =>
    Boolean(s.needsInput || needsInputBySession[s.id]);

  return (
    <aside
      style={{ width: sidebarWidth }}
      className="relative flex h-full shrink-0 flex-col border-r border-[var(--border-hairline)] bg-[var(--bg-sidebar)] select-none"
    >
      {/* Top Action Section */}
      <div className="px-2.5 pt-2.5 pb-2.5 space-y-1 border-b border-[var(--border-hairline)]">
        <button
          type="button"
          onClick={() =>
            void createNewSession(
              activeSession
                ? { cwd: activeSession.cwd, projectId: activeSession.projectId }
                : undefined,
            )
          }
          className="flex w-full items-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-[13.5px] font-medium text-[var(--text-primary)] shadow-[var(--shadow-card)] hover:border-[var(--border-strong)] transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
          <span>New Conversation</span>
        </button>

        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2.5">
            <Search className="w-4 h-4 shrink-0" />
            <span>Search</span>
          </span>
          <kbd className="text-[10.5px] font-mono text-[var(--text-muted)]">⌘K</kbd>
        </button>

        <button
          type="button"
          onClick={() => {
            if (activeSession) {
              openInspector('resources');
            } else {
              setSettingsOpen(true);
            }
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          <Briefcase className="w-4 h-4 shrink-0" />
          <span>Customizations</span>
        </button>
      </div>

      {/* Scrollable Projects & Conversations */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-5">
        {sidebarView === 'code' ? (
          <>
            {/* Projects Section */}
            <section className="space-y-1.5">
              <div className="relative flex items-center justify-between px-2">
                <span className="text-[12px] font-medium text-[var(--text-muted)]">
                  Projects
                </span>
                <div className="flex items-center gap-0.5 text-[var(--text-muted)]">
                  <button
                    type="button"
                    onClick={() => setFilterMenuOpen((v) => !v)}
                    className={`rounded p-1 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer ${
                      filterMode !== 'all' || sortMode !== 'recent'
                        ? 'text-[var(--accent)]'
                        : ''
                    }`}
                    title="Filter & sort"
                  >
                    <ListFilter className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void addProject()}
                    className="rounded p-1 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                    title="Add project folder"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {filterMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setFilterMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-7 z-40 w-44 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-1.5 shadow-[var(--shadow-popover)] text-[12px]">
                      <div className="px-2 py-1 text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                        Filter
                      </div>
                      {(
                        [
                          ['all', 'All sessions'],
                          ['working', 'Working'],
                          ['needs_input', 'Needs input'],
                        ] as const
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            setFilterMode(val);
                            setFilterMenuOpen(false);
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                        >
                          <span>{label}</span>
                          {filterMode === val && <Check className="w-3 h-3 text-[var(--accent)]" />}
                        </button>
                      ))}
                      <div className="my-1 border-t border-[var(--border-hairline)]" />
                      <div className="px-2 py-1 text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                        Sort
                      </div>
                      {(
                        [
                          ['recent', 'Most recent'],
                          ['name', 'Name (A–Z)'],
                        ] as const
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            setSortMode(val);
                            setFilterMenuOpen(false);
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                        >
                          <span>{label}</span>
                          {sortMode === val && <Check className="w-3 h-3 text-[var(--accent)]" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {projects.length === 0 ? (
                <button
                  type="button"
                  onClick={() => void addProject()}
                  className="mx-1 w-[calc(100%-8px)] rounded-lg border border-dashed border-[var(--border-strong)] px-3 py-2 text-left text-[12px] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  + Add project folder
                </button>
              ) : (
                <div className="space-y-2">
                  {projects.map((project) => {
                    const isCollapsed = Boolean(collapsedProjects[project.id]);
                    const projectSessions = sessionsByProject.get(project.id) ?? [];

                    return (
                      <div key={project.id} className="space-y-0.5">
                        <div className="group flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] leading-5 font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                          <button
                            type="button"
                            onClick={() =>
                              setCollapsedProjects((s) => ({
                                ...s,
                                [project.id]: !isCollapsed,
                              }))
                            }
                            className="flex flex-1 min-w-0 items-center gap-2 text-left cursor-pointer"
                            title={project.path}
                          >
                            <Folder className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                            <span className="truncate">{project.name}</span>
                            {project.pinned && (
                              <Pin className="w-2.5 h-2.5 text-[var(--accent)] shrink-0" />
                            )}
                          </button>

                          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                void createNewSession({ cwd: project.path, projectId: project.id })
                              }
                              className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] cursor-pointer"
                              title={`New conversation in ${project.name}`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void togglePinProject(project.id)}
                              className={`flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--bg-elevated)] cursor-pointer ${
                                project.pinned ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                              }`}
                              title={project.pinned ? 'Unpin' : 'Pin'}
                            >
                              <Pin className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeProject(project.id)}
                              className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-red-500 cursor-pointer"
                              title="Remove project from sidebar"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {!isCollapsed && projectSessions.length > 0 && (
                          <div className="space-y-0.5">
                            {projectSessions.map((s) => (
                              <SidebarSessionRow
                                key={s.path}
                                session={s}
                                indented
                                isActive={activeSession?.sessionFile === s.path}
                                isRunning={isSessionRunning(s)}
                                needsInput={isSessionNeedsInput(s)}
                                onSelect={() => void openSessionByPath(s.path)}
                                onRename={(name) => void renameSession(s.id, name)}
                                onArchiveToggle={() => void archiveSessionByPath(s.path)}
                                onDelete={() => void deleteSessionByPath(s.path)}
                                onReveal={() => window.shannon.revealInFinder(s.path)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Standalone Conversations Section */}
            <section className="space-y-1">
              <div className="flex items-center justify-between px-2">
                <span className="text-[12px] font-medium text-[var(--text-muted)]">
                  Conversations
                </span>
                <button
                  type="button"
                  onClick={() => void createNewSession()}
                  className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                  title="New conversation"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {visibleStandalone.length === 0 ? (
                <div className="px-2.5 py-2 text-[12px] text-[var(--text-muted)]">
                  No standalone conversations
                </div>
              ) : (
                <div className="space-y-0.5">
                  {visibleStandalone.map((s) => (
                    <SidebarSessionRow
                      key={s.path}
                      session={s}
                      isActive={activeSession?.sessionFile === s.path}
                      isRunning={isSessionRunning(s)}
                      needsInput={isSessionNeedsInput(s)}
                      onSelect={() => void openSessionByPath(s.path)}
                      onRename={(name) => void renameSession(s.id, name)}
                      onArchiveToggle={() => void archiveSessionByPath(s.path)}
                      onDelete={() => void deleteSessionByPath(s.path)}
                      onReveal={() => window.shannon.revealInFinder(s.path)}
                    />
                  ))}
                </div>
              )}

              {standaloneConversations.length > 12 && (
                <button
                  type="button"
                  onClick={() => setShowAllConversations((v) => !v)}
                  className="px-2.5 pt-1 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  {showAllConversations
                    ? 'Show less'
                    : `Show more (${standaloneConversations.length - 12})`}
                </button>
              )}
            </section>
          </>
        ) : (
          /* Archive View */
          <section className="space-y-1.5">
            <div className="flex items-center justify-between px-2">
              <span className="text-[12px] font-medium text-[var(--text-muted)]">
                Archived
              </span>
              <span className="text-[11.5px] text-[var(--text-muted)]">
                {archivedSessions.length}
              </span>
            </div>

            {archivedSessions.length === 0 ? (
              <div className="px-2.5 py-8 text-center space-y-1.5">
                <Archive className="w-5 h-5 mx-auto text-[var(--text-muted)] opacity-70" />
                <p className="text-[12.5px] text-[var(--text-muted)]">No archived conversations</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {archivedSessions.map((s) => (
                  <SidebarSessionRow
                    key={s.path}
                    session={s}
                    isArchivedView
                    isActive={activeSession?.sessionFile === s.path}
                    isRunning={isSessionRunning(s)}
                    needsInput={isSessionNeedsInput(s)}
                    onSelect={() => void openSessionByPath(s.path)}
                    onRename={(name) => void renameSession(s.id, name)}
                    onArchiveToggle={() => void unarchiveSessionByPath(s.path)}
                    onDelete={() => void deleteSessionByPath(s.path)}
                    onReveal={() => window.shannon.revealInFinder(s.path)}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Bottom Settings Footer */}
      <div className="flex h-11 shrink-0 items-center justify-between border-t border-[var(--border-hairline)] px-2.5">
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          title="API & Models Settings (⌘,)"
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span>Settings</span>
          {!hasAnyAuth && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-amber-500"
              title="No API key configured"
            />
          )}
        </button>

        <button
          type="button"
          onClick={cycleTheme}
          className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
          title={`Theme: ${theme} (click to cycle)`}
        >
          <ThemeIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* Resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onMouseDown={startResizing}
        onDoubleClick={() => setSidebarWidth(SIDEBAR_WIDTH_DEFAULT)}
        title="Drag to resize sidebar (double-click to reset)"
        className={`absolute top-0 right-0 bottom-0 z-20 w-1.5 -mr-[3px] cursor-col-resize transition-colors ${
          isResizing ? 'bg-[var(--accent)]/50' : 'hover:bg-[var(--accent)]/30'
        }`}
      />
    </aside>
  );
};
