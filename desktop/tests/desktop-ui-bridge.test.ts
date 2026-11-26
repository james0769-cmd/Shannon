import { describe, expect, it, vi } from 'vitest';
import { createDesktopExtensionUIContext, type ShowExtensionDialog } from '../src/main/pi/desktop-ui-bridge.js';

describe('Desktop extension dialogs', () => {
  it('cancels when no native dialog is available', async () => {
    const ui = createDesktopExtensionUIContext({ notify: () => {} });
    await expect(ui.confirm('Proceed?', 'Please confirm')).resolves.toBe(false);
    await expect(ui.select('Choose', ['First', 'Second'])).resolves.toBeUndefined();
    await expect(ui.input('Input', 'Placeholder')).resolves.toBeUndefined();
  });

  it('waits for the user, defaults to Cancel, and respects an abort signal', async () => {
    const showDialog = vi.fn<ShowExtensionDialog>().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const ui = createDesktopExtensionUIContext({ notify: () => {} }, showDialog);
    await expect(ui.confirm('Proceed?', 'Please confirm')).resolves.toBe(false);
    expect(showDialog).toHaveBeenCalledWith(expect.objectContaining({
      detail: 'Please confirm',
      buttons: ['Continue', 'Cancel'],
      cancelId: 1,
      defaultId: 1,
    }));
    await expect(ui.confirm('Proceed?', 'Please confirm')).resolves.toBe(true);
    await expect(ui.select('Choose', ['First', 'Second'], { signal: AbortSignal.abort() }))
      .resolves.toBeUndefined();
    expect(showDialog).toHaveBeenCalledTimes(2);
  });
});
