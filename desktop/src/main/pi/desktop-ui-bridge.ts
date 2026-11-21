import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import { initTheme } from '@earendil-works/pi-coding-agent';

export interface DesktopUINotifier {
  notify: (level: 'info' | 'warning' | 'error', message: string) => void;
  setTitle?: (title: string) => void;
}

let themeInitialized = false;
function ensureThemeInit(): void {
  if (themeInitialized) return;
  themeInitialized = true;
  try {
    initTheme(undefined, false);
  } catch {
    // Headless fallback
  }
}

/**
 * Lightweight ExtensionUIContext adapter for Electron host.
 * Provides safe fallbacks for extension UI primitives and forwards notifications to the renderer.
 */
export function createDesktopExtensionUIContext(notifier: DesktopUINotifier): ExtensionUIContext {
  let editorText = '';
  let toolsExpanded = false;
  ensureThemeInit();

  return {
    select: async (_title, options) => options[0],
    confirm: async () => true,
    input: async (_title, placeholder) => placeholder,
    notify: (message, type = 'info') => {
      notifier.notify(type, message);
    },
    onTerminalInput: () => () => {},
    setStatus: () => {},
    setWorkingMessage: () => {},
    setWorkingVisible: () => {},
    setWorkingIndicator: () => {},
    setHiddenThinkingLabel: () => {},
    setWidget: () => {},
    setFooter: () => {},
    setHeader: () => {},
    setTitle: (title) => {
      notifier.setTitle?.(title);
    },
    custom: async () => undefined as never,
    pasteToEditor: (text) => {
      editorText += text;
    },
    setEditorText: (text) => {
      editorText = text;
    },
    getEditorText: () => editorText,
    editor: async (_title, prefill) => prefill,
    addAutocompleteProvider: () => {},
    setEditorComponent: () => {},
    getEditorComponent: () => undefined,
    get theme() {
      return {} as unknown as ExtensionUIContext['theme'];
    },
    getAllThemes: () => [],
    getTheme: () => undefined,
    setTheme: () => ({ success: false, error: 'Theme managed by Shannon UI' }),
    getToolsExpanded: () => toolsExpanded,
    setToolsExpanded: (expanded) => {
      toolsExpanded = expanded;
    },
  };
}
