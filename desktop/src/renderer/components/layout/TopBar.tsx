import React, { useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Download,
  Edit3,
  Folder,
  FolderOpen,
  GitBranch,
  GitFork,
  Layers,
  LayoutList,
  Minimize2,
  MoreHorizontal,
  PanelLeft,
  Settings,
  SquarePen,
  Terminal,
  Trash2,
} from 'lucide-react';
import { useAppStore } from '../../stores/app-store.js';

export const TopBar: React.FC = () => {
  const {
    sidebarCollapsed,
    sidebarWidth,
    sidebarView,
    setSidebarView,
    toggleSidebar,
    sessionHistory,
    sessionHistoryIndex,
    navigateHistoryBack,
    navigateHistoryForward,
    activeSession,
    sessions,
    projects,
    inspectorOpen,
    inspectorTab,
    openInspector,
    closeInspector,
    terminalOpen,
    toggleTerminal,
    createNewSession,
    renameSession,
    archiveSessionByPath,
    unarchiveSessionByPath,
    deleteSessionByPath,
    exportActiveSessionHtml,
    compactActiveSession,
    setSettingsOpen,
  } = useAppStore();

  const [titleMenuOpen, setTitleMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const canGoBack = sessionHistoryIndex > 0;
  const canGoForward =
    sessionHistoryIndex >= 0 && sessionHistoryIndex < sessionHistory.length - 1;

  const project = activeSession?.projectId
    ? projects.find((p) => p.id === activeSession.projectId)
    : undefined;

  const activeSummary = useMemo(
    () => sessions.find((s) => s.path === activeSession?.sessionFile),
    [sessions, activeSession?.sessionFile],
  );
  const isArchived = Boolean(activeSummary?.archived);

  const handleInspectorTab = (tab: 'context' | 'tree' | 'resources') => {
    if (inspectorOpen && inspectorTab === tab) {
      closeInspector();
    } else {
      openInspector(tab);
    }
  };

  return (
    <header className="app-drag-region flex h-11 shrink-0 items-center border-b border-[var(--border-hairline)] bg-[var(--bg-sidebar)] select-none">
      {/* Left chrome aligned with sidebar */}
      <div
        style={sidebarCollapsed ? undefined : { width: sidebarWidth }}
        className={`flex h-full items-center justify-between pl-[74px] pr-2.5 ${
          sidebarCollapsed
            ? 'w-auto gap-2 border-r border-transparent'
            : 'shrink-0 border-r border-[var(--border-hairline)]'
        }`}
      >
        <div className="app-no-drag flex items-center gap-0.5 text-[var(--text-secondary)]">
          <button
            type="button"
            onClick={() => void toggleSidebar()}
            className="rounded-md p-1.5 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
            title="Toggle sidebar (⌘B)"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={!canGoBack}
            onClick={() => void navigateHistoryBack()}
            className="rounded-md p-1 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            title="Previous chat"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={!canGoForward}
            onClick={() => void navigateHistoryForward()}
            className="rounded-md p-1 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            title="Next chat"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Segmented View Toggle: Code (Left) vs Archive (Right) */}
        <div className="app-no-drag flex items-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-0.5">
          <button
            type="button"
            onClick={() => setSidebarView('code')}
            className={`rounded-md p-1 transition-colors cursor-pointer ${
              sidebarView === 'code'
                ? 'bg-[var(--bg-active-row)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
            title="Code"
          >
            <Code2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setSidebarView('archive')}
            className={`rounded-md p-1 transition-colors cursor-pointer ${
              sidebarView === 'archive'
                ? 'bg-[var(--bg-active-row)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
            title="Archive"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Right chrome over main workspace */}
      <div className="flex flex-1 min-w-0 h-full items-center justify-between bg-[var(--bg-canvas)] px-4">
        <div className="app-no-drag relative flex items-center gap-2 min-w-0">
          {activeSession ? (
            editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => {
                  setEditingTitle(false);
                  if (titleDraft.trim()) {
                    void renameSession(activeSession.sessionId, titleDraft.trim());
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setEditingTitle(false);
                    if (titleDraft.trim()) {
                      void renameSession(activeSession.sessionId, titleDraft.trim());
                    }
                  }
                  if (e.key === 'Escape') setEditingTitle(false);
                }}
                className="rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 py-0.5 text-[13.5px] font-medium text-[var(--text-primary)] outline-none"
              />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setTitleMenuOpen((v) => !v)}
                  className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[13.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] truncate max-w-[340px] cursor-pointer"
                >
                  <span className="truncate">{activeSession.name || 'New chat'}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                </button>

                {isArchived && (
                  <span className="rounded-md bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)]">
                    Archived
                  </span>
                )}

                {project?.gitBranch && (
                  <span className="hidden md:inline-flex items-center gap-1 rounded-md bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[11px] font-mono text-[var(--text-secondary)]">
                    <GitBranch className="w-3 h-3" />
                    {project.gitBranch}
                  </span>
                )}

                {titleMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setTitleMenuOpen(false)}
                    />
                    <div className="absolute left-0 top-9 z-40 w-48 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-elevated)] py-1 shadow-[var(--shadow-popover)] text-[12.5px]">
                      <button
                        type="button"
                        onClick={() => {
                          setTitleMenuOpen(false);
                          setTitleDraft(activeSession.name || 'New chat');
                          setEditingTitle(true);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                        Rename chat
                      </button>
                      {activeSession.sessionFile && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setTitleMenuOpen(false);
                              if (isArchived) {
                                void unarchiveSessionByPath(activeSession.sessionFile!);
                              } else {
                                void archiveSessionByPath(activeSession.sessionFile!);
                              }
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                          >
                            {isArchived ? (
                              <ArchiveRestore className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                            ) : (
                              <Archive className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                            )}
                            {isArchived ? 'Restore from Archive' : 'Archive chat'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTitleMenuOpen(false);
                              window.shannon.revealInFinder(activeSession.sessionFile!);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                          >
                            <FolderOpen className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                            Reveal JSONL
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setTitleMenuOpen(false);
                          void exportActiveSessionHtml();
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                        Export HTML
                      </button>
                      {activeSession.sessionFile && (
                        <>
                          <div className="my-1 border-t border-[var(--border-hairline)]" />
                          <button
                            type="button"
                            onClick={() => {
                              setTitleMenuOpen(false);
                              void deleteSessionByPath(activeSession.sessionFile!);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-red-500 hover:bg-[var(--bg-hover)] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete chat
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </>
            )
          ) : (
            <span className="text-[13.5px] font-medium text-[var(--text-secondary)]">
              Shannon
            </span>
          )}
        </div>

        {/* Minimalist Icon Toolbar */}
        <div className="app-no-drag relative flex items-center gap-0.5 text-[var(--text-secondary)]">
          <button
            type="button"
            onClick={() =>
              void createNewSession(
                activeSession
                  ? { cwd: activeSession.cwd, projectId: activeSession.projectId }
                  : undefined,
              )
            }
            className="rounded-md p-1.5 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
            title="New Chat (⌘N)"
          >
            <SquarePen className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => void toggleTerminal()}
            className={`rounded-md p-1.5 transition-colors cursor-pointer ${
              terminalOpen
                ? 'bg-[var(--bg-active-row)] text-[var(--text-primary)]'
                : 'hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            }`}
            title="Toggle Terminal (⌃` / ⌘`)"
          >
            <Terminal className="w-4 h-4" />
          </button>

          {activeSession && (
            <>
              <button
                type="button"
                onClick={() => handleInspectorTab('context')}
                className={`rounded-md p-1.5 transition-colors cursor-pointer ${
                  inspectorOpen && inspectorTab === 'context'
                    ? 'bg-[var(--bg-active-row)] text-[var(--text-primary)]'
                    : 'hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                }`}
                title="Context Breakdown"
              >
                <LayoutList className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => handleInspectorTab('tree')}
                className={`rounded-md p-1.5 transition-colors cursor-pointer ${
                  inspectorOpen && inspectorTab === 'tree'
                    ? 'bg-[var(--bg-active-row)] text-[var(--text-primary)]'
                    : 'hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                }`}
                title="Session Branch Tree"
              >
                <GitFork className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => handleInspectorTab('resources')}
                className={`rounded-md p-1.5 transition-colors cursor-pointer ${
                  inspectorOpen && inspectorTab === 'resources'
                    ? 'bg-[var(--bg-active-row)] text-[var(--text-primary)]'
                    : 'hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                }`}
                title="Project Instructions, Skills & Tools"
              >
                <Layers className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => window.shannon.revealInFinder(activeSession.cwd)}
                className="rounded-md p-1.5 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                title={`Reveal folder: ${activeSession.cwd}`}
              >
                <Folder className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setMoreMenuOpen((v) => !v)}
            className="rounded-md p-1.5 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
            title="More options"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {moreMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setMoreMenuOpen(false)}
              />
              <div className="absolute right-0 top-9 z-40 w-48 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-elevated)] py-1 shadow-[var(--shadow-popover)] text-[12.5px]">
                {activeSession && (
                  <>
                    <button
                      type="button"
                      disabled={activeSession.isStreaming}
                      onClick={() => {
                        setMoreMenuOpen(false);
                        void compactActiveSession();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-40 cursor-pointer"
                    >
                      <Minimize2 className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                      Compact context
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        void exportActiveSessionHtml();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                      Export HTML
                    </button>
                    <div className="my-1 border-t border-[var(--border-hairline)]" />
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    setSettingsOpen(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                  API &amp; Models…
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
