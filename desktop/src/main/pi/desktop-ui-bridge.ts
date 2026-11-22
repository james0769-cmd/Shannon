import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import { initTheme } from '@earendil-works/pi-coding-agent';
import type { MessageBoxOptions } from 'electron';

export interface DesktopUINotifier {
  notify: (level: 'info' | 'warning' | 'error', message: string) => void;
  setTitle?: (title: string) => void;
}

export type ShowExtensionDialog = (options: MessageBoxOptions) => Promise<number | undefined>;

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
export function createDesktopExtensionUIContext(
  notifier: DesktopUINotifier,
  showDialog?: ShowExtensionDialog,
): ExtensionUIContext {
  let editorText = '';
  let toolsExpanded = false;
  ensureThemeInit();

  const select = async (
    title: string,
    options: string[],
    opts?: Parameters<ExtensionUIContext['select']>[2],
    detail?: string,
  ) => {
    if (!showDialog || options.length === 0) return undefined;
    const signals = opts?.signal ? [opts.signal] : [];
    if (opts?.timeout !== undefined) signals.push(AbortSignal.timeout(opts.timeout));
    const signal = signals.length > 0 ? AbortSignal.any(signals) : undefined;
    if (signal?.aborted) return undefined;
    const cancelId = options.length;
    const response = await showDialog({
      type: 'question',
      message: title,
      detail,
      buttons: [...options, 'Cancel'],
      defaultId: cancelId,
      cancelId,
      noLink: true,
      signal,
    });
    return response === undefined || signal?.aborted ? undefined : options[response];
  };

  return {
    select,
    confirm: async (title, message, opts) =>
      (await select(title, ['Continue'], opts, message)) !== undefined,
    input: async () => undefined,
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
    editor: async () => undefined,
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
