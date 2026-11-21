import React from 'react';
import { X } from 'lucide-react';
import { useAppStore, type InspectorTab } from '../../stores/app-store.js';
import { ContextPanel } from './ContextPanel.js';
import { ResourcesPanel } from './ResourcesPanel.js';
import { SessionTreePanel } from './SessionTreePanel.js';

export const InspectorDrawer: React.FC = () => {
  const { inspectorOpen, inspectorTab, openInspector, closeInspector } = useAppStore();

  if (!inspectorOpen) return null;

  const tabs: Array<{ id: InspectorTab; label: string }> = [
    { id: 'context', label: 'Context' },
    { id: 'tree', label: 'Tree' },
    { id: 'resources', label: 'Resources' },
  ];

  return (
    <aside className="flex h-full w-[348px] shrink-0 flex-col border-l border-[var(--border-hairline)] bg-[var(--bg-sidebar)]">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-hairline)] px-3">
        <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => openInspector(tab.id)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors cursor-pointer ${
                inspectorTab === tab.id
                  ? 'bg-[var(--bg-active-row)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={closeInspector}
          className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
          title="Close inspector"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {inspectorTab === 'context' && <ContextPanel />}
        {inspectorTab === 'tree' && <SessionTreePanel />}
        {inspectorTab === 'resources' && <ResourcesPanel />}
      </div>
    </aside>
  );
};
