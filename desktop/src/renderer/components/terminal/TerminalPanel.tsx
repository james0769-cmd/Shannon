import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { FolderInput, Plus, RotateCw, Trash2, X } from 'lucide-react';
import { TERMINAL_WIDTH_DEFAULT, useAppStore } from '../../stores/app-store.js';

function getResolvedTheme(): 'light' | 'dark' {
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'dark' ? 'dark' : 'light';
}

function getXtermTheme(mode: 'light' | 'dark') {
  if (mode === 'dark') {
    return {
      background: '#161617',
      foreground: '#ECECEF',
      cursor: '#D97757',
      cursorAccent: '#161617',
      selectionBackground: 'rgba(217, 119, 87, 0.28)',
      black: '#1D1D20',
      red: '#E06C75',
      green: '#98C379',
      yellow: '#E5C07B',
      blue: '#61AFEF',
      magenta: '#C678DD',
      cyan: '#56B6C2',
      white: '#D4D4D8',
      brightBlack: '#686870',
      brightRed: '#F18B93',
      brightGreen: '#B0D994',
      brightYellow: '#F0D196',
      brightBlue: '#84C5F7',
      brightMagenta: '#D896EB',
      brightCyan: '#75CBD6',
      brightWhite: '#FFFFFF',
    };
  }
  return {
    background: '#F6F4EE',
    foreground: '#1D1C1A',
    cursor: '#C96442',
    cursorAccent: '#F6F4EE',
    selectionBackground: 'rgba(201, 100, 66, 0.22)',
    black: '#1D1C1A',
    red: '#B9382C',
    green: '#2E7D4F',
    yellow: '#A16207',
    blue: '#2563EB',
    magenta: '#9333EA',
    cyan: '#0E7490',
    white: '#E5E1D6',
    brightBlack: '#646058',
    brightRed: '#DC2626',
    brightGreen: '#16A34A',
    brightYellow: '#CA8A04',
    brightBlue: '#3B82F6',
    brightMagenta: '#A855F7',
    brightCyan: '#06B6D4',
    brightWhite: '#FAF9F5',
  };
}

function shellEscapeSingle(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function basenameOfPath(fullPath: string): string {
  const normalized = fullPath.replace(/[/\\]+$/, '');
  const parts = normalized.split(/[/\\]/);
  return parts[parts.length - 1] || fullPath;
}

interface XtermInstanceProps {
  terminalId: string;
  isVisible: boolean;
  clearSignal: number;
  focusSignal: number;
}

const XtermInstance: React.FC<XtermInstanceProps> = ({
  terminalId,
  isVisible,
  clearSignal,
  focusSignal,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const isVisibleRef = useRef(isVisible);
  isVisibleRef.current = isVisible;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12.5,
      lineHeight: 1.35,
      fontFamily:
        '"SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      scrollback: 5000,
      macOptionIsMeta: true,
      allowProposedApi: true,
      theme: getXtermTheme(getResolvedTheme()),
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      void window.shannon.openExternal(uri);
    });

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(container);

    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown') return true;
      const mod = ev.metaKey || ev.ctrlKey;
      const key = ev.key.toLowerCase();

      // Let global Shannon shortcuts bubble up to window
      if (mod && (key === 'k' || key === 'n' || key === 'b' || ev.key === ',')) {
        return false;
      }
      if (ev.ctrlKey && ev.key === '`') {
        return false;
      }

      // Copy selection with Cmd+C on macOS when text is selected
      if (ev.metaKey && !ev.ctrlKey && key === 'c' && term.hasSelection()) {
        void navigator.clipboard.writeText(term.getSelection());
        return false;
      }
      return true;
    });

    termRef.current = term;
    fitRef.current = fitAddon;

    const fitIfReady = () => {
      if (!isVisibleRef.current) return;
      if (container.clientWidth <= 0 || container.clientHeight <= 0) return;
      try {
        fitAddon.fit();
      } catch {
        // Ignore fit errors during mount/unmount transitions
      }
    };

    // Subscribe before loading replay buffer so no chunks are missed
    let hydrated = false;
    const pendingChunks: string[] = [];

    const unsubscribeData = window.shannon.onTerminalData((payload) => {
      if (payload.terminalId !== terminalId) return;
      if (!hydrated) {
        pendingChunks.push(payload.data);
      } else {
        term.write(payload.data);
      }
    });

    let cancelled = false;
    void window.shannon.getTerminalBuffer(terminalId).then((snapshot) => {
      if (cancelled) return;
      if (snapshot) {
        term.write(snapshot);
      }
      hydrated = true;
      while (pendingChunks.length > 0) {
        const chunk = pendingChunks.shift();
        if (chunk) term.write(chunk);
      }
      requestAnimationFrame(() => {
        fitIfReady();
        if (isVisibleRef.current) {
          term.focus();
        }
      });
    });

    const dataDisposable = term.onData((data) => {
      window.shannon.writeTerminal(terminalId, data);
    });

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      window.shannon.resizeTerminal(terminalId, cols, rows);
    });

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(fitIfReady);
    });
    resizeObserver.observe(container);

    const themeObserver = new MutationObserver(() => {
      term.options.theme = getXtermTheme(getResolvedTheme());
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      cancelled = true;
      themeObserver.disconnect();
      resizeObserver.disconnect();
      resizeDisposable.dispose();
      dataDisposable.dispose();
      unsubscribeData();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [terminalId]);

  useEffect(() => {
    if (!isVisible) return;
    const id = requestAnimationFrame(() => {
      const container = containerRef.current;
      const fitAddon = fitRef.current;
      const term = termRef.current;
      if (container && fitAddon && container.clientWidth > 0 && container.clientHeight > 0) {
        try {
          fitAddon.fit();
        } catch {
          // Ignore
        }
      }
      term?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [isVisible, focusSignal]);

  useEffect(() => {
    if (clearSignal > 0 && isVisibleRef.current) {
      termRef.current?.clear();
      termRef.current?.focus();
    }
  }, [clearSignal]);

  return (
    <div
      ref={containerRef}
      className={isVisible ? 'h-full w-full p-2 overflow-hidden' : 'hidden'}
    />
  );
};

export const TerminalPanel: React.FC = () => {
  const {
    terminalOpen,
    terminalWidth,
    setTerminalWidth,
    terminals,
    activeTerminalId,
    activeSession,
    closeTerminal,
    createTerminal,
    selectTerminal,
    killTerminal,
    markTerminalExited,
  } = useAppStore();

  const [isResizing, setIsResizing] = useState(false);
  const [clearSignal, setClearSignal] = useState(0);
  const [focusSignal, setFocusSignal] = useState(0);

  useEffect(() => {
    const unsubscribeExit = window.shannon.onTerminalExit((payload) => {
      markTerminalExited(payload.terminalId, payload.exitCode);
    });
    return () => unsubscribeExit();
  }, [markTerminalExited]);

  const activeTerminal = useMemo(
    () => terminals.find((t) => t.id === activeTerminalId) ?? terminals[0] ?? null,
    [terminals, activeTerminalId],
  );

  const startResizing = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = terminalWidth;
      setIsResizing(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (moveEvent: MouseEvent) => {
        setTerminalWidth(startWidth - (moveEvent.clientX - startX));
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
    [terminalWidth, setTerminalWidth],
  );

  if (terminals.length === 0 && !terminalOpen) {
    return null;
  }

  const handleCdProject = () => {
    if (!activeTerminal || activeTerminal.exited || !activeSession?.cwd) return;
    window.shannon.writeTerminal(
      activeTerminal.id,
      `cd ${shellEscapeSingle(activeSession.cwd)}\r`,
    );
    setFocusSignal((n) => n + 1);
  };

  const handleRestartTerminal = async () => {
    if (!activeTerminal) return;
    const targetCwd = activeTerminal.cwd;
    await killTerminal(activeTerminal.id);
    await createTerminal(targetCwd);
  };

  return (
    <aside
      style={{ width: terminalWidth }}
      className={
        terminalOpen
          ? 'relative flex h-full shrink-0 flex-col border-l border-[var(--border-hairline)] bg-[var(--bg-sidebar)]'
          : 'hidden'
      }
    >
      {/* Left-edge drag resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize terminal panel"
        onMouseDown={startResizing}
        onDoubleClick={() => setTerminalWidth(TERMINAL_WIDTH_DEFAULT)}
        title="Drag to resize terminal (double-click to reset)"
        className={`absolute top-0 left-0 bottom-0 z-20 w-1.5 -ml-[3px] cursor-col-resize transition-colors ${
          isResizing ? 'bg-[var(--accent)]/50' : 'hover:bg-[var(--accent)]/30'
        }`}
      />

      {/* Header with terminal tabs and actions */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-[var(--border-hairline)] px-2.5">
        <div className="flex flex-1 min-w-0 items-center gap-1 overflow-x-auto no-scrollbar">
          {terminals.map((term, index) => {
            const isActive = activeTerminal?.id === term.id;
            return (
              <div
                key={term.id}
                onClick={() => {
                  selectTerminal(term.id);
                  setFocusSignal((n) => n + 1);
                }}
                className={`group flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] cursor-pointer shrink-0 max-w-[140px] transition-colors ${
                  isActive
                    ? 'bg-[var(--bg-active-row)] text-[var(--text-primary)] font-medium'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                }`}
                title={term.cwd}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                    term.exited ? 'bg-[var(--text-muted)]/60' : 'bg-emerald-500'
                  }`}
                />
                <span className="truncate">
                  {term.title || `Terminal ${index + 1}`}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void killTerminal(term.id);
                  }}
                  className="rounded p-0.5 text-[var(--text-muted)] opacity-60 hover:opacity-100 hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
                  title="Kill terminal"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-0.5 shrink-0 text-[var(--text-secondary)]">
          <button
            type="button"
            onClick={() => void createTerminal(activeSession?.cwd)}
            className="rounded-md p-1 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
            title="New terminal tab"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setClearSignal((n) => n + 1)}
            disabled={!activeTerminal}
            className="rounded-md p-1 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
            title="Clear terminal output"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={closeTerminal}
            className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
            title="Hide terminal panel (⌃`)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Subheader: cwd + shell + quick project sync / restart */}
      {activeTerminal && (
        <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)]/60 px-3 text-[11px] text-[var(--text-muted)]">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-mono" title={activeTerminal.cwd}>
              {activeTerminal.cwd}
            </span>
            <span className="shrink-0 opacity-60">· {basenameOfPath(activeTerminal.shell)}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {activeSession?.cwd &&
              activeSession.cwd !== activeTerminal.cwd &&
              !activeTerminal.exited && (
                <button
                  type="button"
                  onClick={handleCdProject}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                  title={`cd ${activeSession.cwd}`}
                >
                  <FolderInput className="w-3 h-3" />
                  <span>cd project</span>
                </button>
              )}

            {activeTerminal.exited && (
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-secondary)]">
                  Exited ({activeTerminal.exitCode ?? 0})
                </span>
                <button
                  type="button"
                  onClick={() => void handleRestartTerminal()}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] cursor-pointer"
                  title="Restart terminal"
                >
                  <RotateCw className="w-3 h-3" />
                  <span>Restart</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Terminal viewport */}
      <div
        className="flex-1 min-h-0 overflow-hidden"
        style={{ backgroundColor: getXtermTheme(getResolvedTheme()).background }}
      >
        {terminals.map((term) => (
          <XtermInstance
            key={term.id}
            terminalId={term.id}
            isVisible={terminalOpen && activeTerminal?.id === term.id}
            clearSignal={clearSignal}
            focusSignal={focusSignal}
          />
        ))}
      </div>
    </aside>
  );
};
