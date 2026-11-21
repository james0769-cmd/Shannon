import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { MessageTimeline } from './components/chat/MessageTimeline.js';
import { CommandPalette } from './components/common/CommandPalette.js';
import { Composer } from './components/composer/Composer.js';
import { InspectorDrawer } from './components/inspector/InspectorDrawer.js';
import { TopBar } from './components/layout/TopBar.js';
import { SettingsModal } from './components/settings/SettingsModal.js';
import { Sidebar } from './components/sidebar/Sidebar.js';
import { useAppStore } from './stores/app-store.js';

export const App: React.FC = () => {
  const {
    theme,
    toasts,
    dismissToast,
    init,
    handleStreamEvent,
    createNewSession,
    toggleSidebar,
    setCommandPaletteOpen,
    setSettingsOpen,
    activeSession,
    abortActiveRun,
    abortActiveBash,
  } = useAppStore();

  useEffect(() => {
    void init();
    const unsubscribe = window.shannon.onEvent((event) => {
      handleStreamEvent(event);
    });
    return () => {
      unsubscribe();
    };
  }, [init, handleStreamEvent]);

  useEffect(() => {
    const apply = () => {
      const resolved =
        theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : theme;
      document.documentElement.setAttribute('data-theme', resolved);
    };
    apply();

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      } else if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        void createNewSession(
          activeSession
            ? { cwd: activeSession.cwd, projectId: activeSession.projectId }
            : undefined,
        );
      } else if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        void toggleSidebar();
      } else if (mod && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
      } else if (e.key === 'Escape') {
        if (activeSession?.isBashRunning) {
          void abortActiveBash();
        } else if (activeSession?.isStreaming) {
          void abortActiveRun();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeSession,
    abortActiveBash,
    abortActiveRun,
    createNewSession,
    setCommandPaletteOpen,
    setSettingsOpen,
    toggleSidebar,
  ]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <TopBar />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar />

        <main className="flex flex-1 flex-col min-w-0 h-full">
          <MessageTimeline />
          <Composer />
        </main>

        <InspectorDrawer />
      </div>

      <SettingsModal />
      <CommandPalette />

      {toasts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[12.5px] shadow-[var(--shadow-popover)] ${
                toast.level === 'error'
                  ? 'border-red-500/40 bg-[var(--bg-elevated)] text-red-500'
                  : toast.level === 'warning'
                    ? 'border-amber-500/40 bg-[var(--bg-elevated)] text-amber-500'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--text-primary)]'
              }`}
            >
              <span className="flex-1 break-words">{toast.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
