import React, { useState } from 'react';
import { GitCommitHorizontal, GitFork } from 'lucide-react';
import type { SessionTreeItem } from '@shared/types';
import { useAppStore } from '../../stores/app-store.js';

const TreeNodeRow: React.FC<{
  node: SessionTreeItem;
  depth: number;
  onNavigate: (id: string) => void;
  onFork: (id: string) => void;
}> = ({ node, depth, onNavigate, onFork }) => {
  return (
    <div>
      <div
        className={`group flex items-start gap-2 rounded-lg px-2 py-1.5 text-[12px] transition-colors ${
          node.isActiveLeaf
            ? 'bg-[var(--accent-soft)] border border-[var(--accent)]/40'
            : node.isOnActiveBranch
              ? 'bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]'
              : 'opacity-70 hover:opacity-100 hover:bg-[var(--bg-subtle)]'
        }`}
        style={{ marginLeft: `${Math.min(depth * 14, 70)}px` }}
      >
        <GitCommitHorizontal
          className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
            node.isActiveLeaf
              ? 'text-[var(--accent)]'
              : node.isOnActiveBranch
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-muted)]'
          }`}
        />

        <button
          type="button"
          onClick={() => onNavigate(node.id)}
          className="flex-1 min-w-0 text-left cursor-pointer"
          title="Switch active branch to this node"
        >
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10.5px] uppercase text-[var(--text-muted)]">
              {node.role || node.type}
            </span>
            {node.isActiveLeaf && (
              <span className="rounded bg-[var(--accent)] px-1 py-0.2 text-[9.5px] font-medium text-white">
                HEAD
              </span>
            )}
          </div>
          <div className="truncate text-[var(--text-primary)]">{node.preview}</div>
        </button>

        {node.role === 'user' && (
          <button
            type="button"
            onClick={() => onFork(node.id)}
            className="opacity-0 group-hover:opacity-100 rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-canvas)] hover:text-[var(--accent)] cursor-pointer"
            title="Fork into new session"
          >
            <GitFork className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {node.children.map((child) => (
        <TreeNodeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          onNavigate={onNavigate}
          onFork={onFork}
        />
      ))}
    </div>
  );
};

export const SessionTreePanel: React.FC = () => {
  const { activeSession, navigateSessionTree, forkFromEntry } = useAppStore();
  const [summarizeOnSwitch, setSummarizeOnSwitch] = useState(false);

  if (!activeSession) return null;

  return (
    <div className="p-4 space-y-3 text-[12.5px]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Session Tree
        </span>
        <label className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={summarizeOnSwitch}
            onChange={(e) => setSummarizeOnSwitch(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Summarize abandoned branch
        </label>
      </div>

      {activeSession.tree.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-hairline)] p-4 text-center text-[12px] text-[var(--text-muted)]">
          No tree entries yet. Start chatting or run !bash commands.
        </div>
      ) : (
        <div className="space-y-1">
          {activeSession.tree.map((root) => (
            <TreeNodeRow
              key={root.id}
              node={root}
              depth={0}
              onNavigate={(id) => void navigateSessionTree(id, summarizeOnSwitch)}
              onFork={(id) => void forkFromEntry(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
