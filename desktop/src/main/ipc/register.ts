import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import type {
  ImageAttachment,
  ProjectRecord,
  ProviderApiProtocol,
  SaveProviderInput,
  ThemeMode,
  ThinkingLevel,
} from '../../shared/types.js';
import type { ProjectStore } from '../pi/project-store.js';
import type { SessionHub } from '../pi/session-hub.js';

export function registerIpcHandlers(
  getWindow: () => BrowserWindow | null,
  projectStore: ProjectStore,
  sessionHub: SessionHub,
): void {
  // App & Config
  ipcMain.handle('app:getConfig', () => ({
    theme: projectStore.getTheme(),
    sidebarCollapsed: projectStore.getSidebarCollapsed(),
    agentDir: getAgentDir(),
  }));

  ipcMain.handle('app:setTheme', (_e, theme: ThemeMode) => {
    projectStore.setTheme(theme);
  });

  ipcMain.handle('app:setSidebarCollapsed', (_e, collapsed: boolean) => {
    projectStore.setSidebarCollapsed(collapsed);
  });

  ipcMain.handle('app:pickDirectory', async () => {
    const win = getWindow();
    const result = win
      ? await dialog.showOpenDialog(win, {
          properties: ['openDirectory', 'createDirectory'],
          title: 'Choose Project Folder',
        })
      : await dialog.showOpenDialog({
          properties: ['openDirectory', 'createDirectory'],
          title: 'Choose Project Folder',
        });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('app:openPath', async (_e, targetPath: string) => {
    await shell.openPath(targetPath);
  });

  ipcMain.handle('app:revealInFinder', (_e, targetPath: string) => {
    shell.showItemInFolder(targetPath);
  });

  ipcMain.handle('app:openExternal', async (_e, url: string) => {
    await shell.openExternal(url);
  });

  // Projects
  ipcMain.handle('projects:list', () => projectStore.listProjects());

  ipcMain.handle('projects:add', async (_e, dirPath?: string) => {
    let targetPath = dirPath;
    if (!targetPath) {
      const win = getWindow();
      const result = win
        ? await dialog.showOpenDialog(win, {
            properties: ['openDirectory', 'createDirectory'],
            title: 'Add Project Folder',
          })
        : await dialog.showOpenDialog({
            properties: ['openDirectory', 'createDirectory'],
            title: 'Add Project Folder',
          });
      if (result.canceled || result.filePaths.length === 0) return null;
      targetPath = result.filePaths[0];
    }
    return projectStore.addProject(targetPath);
  });

  ipcMain.handle('projects:remove', (_e, projectId: string) => {
    projectStore.removeProject(projectId);
  });

  ipcMain.handle(
    'projects:update',
    (
      _e,
      projectId: string,
      patch: Partial<Pick<ProjectRecord, 'name' | 'pinned' | 'defaultModel' | 'defaultThinkingLevel'>>,
    ) => projectStore.updateProject(projectId, patch),
  );

  // Sessions
  ipcMain.handle('sessions:list', () => sessionHub.listSessions());
  ipcMain.handle('sessions:create', (_e, options?: { cwd?: string; projectId?: string }) =>
    sessionHub.createSession(options),
  );
  ipcMain.handle('sessions:open', (_e, sessionPath: string) => sessionHub.openSession(sessionPath));
  ipcMain.handle('sessions:delete', (_e, sessionPath: string) =>
    sessionHub.deleteSession(sessionPath),
  );
  ipcMain.handle('sessions:archive', (_e, sessionPath: string) =>
    sessionHub.archiveSession(sessionPath),
  );
  ipcMain.handle('sessions:unarchive', (_e, sessionPath: string) =>
    sessionHub.unarchiveSession(sessionPath),
  );
  ipcMain.handle('sessions:setName', (_e, sessionId: string, name: string) =>
    sessionHub.setSessionName(sessionId, name),
  );
  ipcMain.handle('sessions:exportHtml', (_e, sessionId: string) =>
    sessionHub.exportSessionHtml(sessionId),
  );

  // Chat & Execution
  ipcMain.handle(
    'sessions:prompt',
    (
      _e,
      sessionId: string,
      message: string,
      options?: { images?: ImageAttachment[]; streamingBehavior?: 'steer' | 'followUp' },
    ) => sessionHub.prompt(sessionId, message, options),
  );
  ipcMain.handle('sessions:abort', (_e, sessionId: string) => sessionHub.abort(sessionId));
  ipcMain.handle(
    'sessions:executeBash',
    (_e, sessionId: string, command: string, excludeFromContext: boolean) =>
      sessionHub.executeBash(sessionId, command, excludeFromContext),
  );
  ipcMain.handle('sessions:abortBash', (_e, sessionId: string) => sessionHub.abortBash(sessionId));
  ipcMain.handle('sessions:setModel', (_e, sessionId: string, provider: string, modelId: string) =>
    sessionHub.setModel(sessionId, provider, modelId),
  );
  ipcMain.handle('sessions:setThinkingLevel', (_e, sessionId: string, level: ThinkingLevel) =>
    sessionHub.setThinkingLevel(sessionId, level),
  );

  // Context & Tree
  ipcMain.handle('sessions:getContextBreakdown', (_e, sessionId: string) =>
    sessionHub.getContextBreakdown(sessionId),
  );
  ipcMain.handle('sessions:compact', (_e, sessionId: string, customInstructions?: string) =>
    sessionHub.compactSession(sessionId, customInstructions),
  );
  ipcMain.handle('sessions:reload', (_e, sessionId: string) =>
    sessionHub.reloadSession(sessionId),
  );
  ipcMain.handle('sessions:getTree', (_e, sessionId: string) => sessionHub.getSessionTree(sessionId));
  ipcMain.handle(
    'sessions:navigateTree',
    (_e, sessionId: string, targetId: string, summarize?: boolean) =>
      sessionHub.navigateTree(sessionId, targetId, summarize),
  );
  ipcMain.handle('sessions:fork', (_e, sessionId: string, entryId: string) =>
    sessionHub.forkSession(sessionId, entryId),
  );
  ipcMain.handle('workspace:listFiles', (_e, cwd: string, query: string) =>
    sessionHub.listWorkspaceFiles(cwd, query),
  );

  // Providers & Models
  ipcMain.handle('providers:list', async () => {
    const rt = await sessionHub.getModelRuntime();
    return sessionHub.getProviderStore().listProviders(rt);
  });
  ipcMain.handle('providers:listAvailableModels', async () => {
    const rt = await sessionHub.getModelRuntime();
    return sessionHub.getProviderStore().listAvailableModels(rt);
  });
  ipcMain.handle('providers:save', async (_e, input: SaveProviderInput) => {
    const rt = await sessionHub.getModelRuntime();
    await sessionHub.getProviderStore().saveProvider(input, rt);
    return sessionHub.getProviderStore().listProviders(rt);
  });
  ipcMain.handle('providers:delete', async (_e, providerId: string) => {
    const rt = await sessionHub.getModelRuntime();
    await sessionHub.getProviderStore().deleteProvider(providerId, rt);
    return sessionHub.getProviderStore().listProviders(rt);
  });
  ipcMain.handle(
    'providers:fetchRemoteModels',
    (
      _e,
      params: {
        baseUrl: string;
        apiKey?: string;
        api: ProviderApiProtocol | string;
        headers?: Record<string, string>;
      },
    ) => sessionHub.getProviderStore().fetchRemoteModels(params),
  );
  ipcMain.handle(
    'providers:testConnection',
    async (_e, params: { providerId: string; modelId?: string }) => {
      const rt = await sessionHub.getModelRuntime();
      return sessionHub.getProviderStore().testConnection(rt, params.providerId, params.modelId);
    },
  );
}
