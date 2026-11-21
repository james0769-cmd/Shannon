import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Minimize2, Sparkles } from 'lucide-react';
import type { ContextCategoryKey } from '@shared/types';
import { useAppStore } from '../../stores/app-store.js';

const CATEGORY_COLORS: Record<ContextCategoryKey, string> = {
  system_prompt: '#8B7355',
  project_instructions: '#C96442',
  skills: '#D97706',
  tools_builtin: '#0F766E',
  tools_mcp: '#0284C7',
  tools_extension: '#7C3AED',
  compaction_summary: '#64748B',
  user_messages: '#2563EB',
  assistant_messages: '#059669',
  tool_results: '#DC2626',
  bash_in_context: '#EA580C',
};

function formatTokens(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export const ContextPanel: React.FC = () => {
  const { activeSession, compactActiveSession, highlightEntry } = useAppStore();
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [compactInstructions, setCompactInstructions] = useState('');
  const [compacting, setCompacting] = useState(false);

  const breakdown = activeSession?.contextBreakdown;
  if (!activeSession || !breakdown) {
    return (
      <div className="p-4 text-[12.5px] text-[var(--text-muted)]">
        Open or start a chat to inspect context breakdown.
      </div>
    );
  }

  const nonZeroCategories = breakdown.categories.filter((c) => c.estimatedTokens > 0);
  const { tokens: totalStats, cost } = breakdown.sessionStats;

  const handleCompact = async () => {
    setCompacting(true);
    try {
      await compactActiveSession(compactInstructions);
      setCompactInstructions('');
    } finally {
      setCompacting(false);
    }
  };

  return (
    <div className="p-4 space-y-5 text-[12.5px]">
      {/* Summary Header */}
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3.5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
              Context Window
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-[20px] font-semibold font-mono text-[var(--text-primary)]">
                {formatTokens(breakdown.totalTokens)}
              </span>
              <span className="text-[12.5px] font-mono text-[var(--text-secondary)]">
                / {formatTokens(breakdown.contextWindow)}
              </span>
              {breakdown.percent !== null && (
                <span className="text-[12px] font-medium text-[var(--accent)]">
                  ({breakdown.percent}%)
                </span>
              )}
            </div>
          </div>

          <span
            className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
              breakdown.isApiMeasured
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
            }`}
          >
            {breakdown.isApiMeasured ? 'API Measured' : 'Estimated'}
          </span>
        </div>

        {/* Stacked Progress Bar */}
        <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)] flex">
          {nonZeroCategories.map((cat) => (
            <div
              key={cat.key}
              style={{
                width: `${Math.max(0.5, cat.percent)}%`,
                backgroundColor: CATEGORY_COLORS[cat.key],
              }}
              title={`${cat.label}: ${formatTokens(cat.calibratedTokens)} (${cat.percent}%)`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between text-[11.5px] text-[var(--text-secondary)]">
          <span>Remaining: {formatTokens(breakdown.remainingTokens)}</span>
          {breakdown.excludedBashCount > 0 && (
            <span className="text-[var(--bash-local)]">
              {breakdown.excludedBashCount} local !!bash (0 tokens)
            </span>
          )}
        </div>
      </div>

      {/* Session Billing & Cache Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-2">
          <div className="text-[10.5px] text-[var(--text-muted)]">Session Cost</div>
          <div className="font-mono text-[13px] font-semibold text-[var(--text-primary)]">
            ${cost.toFixed(4)}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-2">
          <div className="text-[10.5px] text-[var(--text-muted)]">Cache Read</div>
          <div className="font-mono text-[13px] font-semibold text-[var(--text-primary)]">
            {formatTokens(totalStats.cacheRead)}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-2">
          <div className="text-[10.5px] text-[var(--text-muted)]">Total Out</div>
          <div className="font-mono text-[13px] font-semibold text-[var(--text-primary)]">
            {formatTokens(totalStats.output)}
          </div>
        </div>
      </div>

      {/* Itemized Categories */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Breakdown by Component
        </div>
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] divide-y divide-[var(--border-hairline)]">
          {breakdown.categories.map((cat) => {
            const hasDetails = Boolean(cat.details && cat.details.length > 0);
            const isOpen = Boolean(expandedKeys[cat.key]);
            return (
              <div key={cat.key}>
                <button
                  type="button"
                  disabled={!hasDetails}
                  onClick={() =>
                    setExpandedKeys((s) => ({ ...s, [cat.key]: !isOpen }))
                  }
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left ${
                    hasDetails ? 'hover:bg-[var(--bg-subtle)]/50 cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[cat.key] }}
                  />
                  <span className="flex-1 truncate text-[var(--text-primary)]">
                    {cat.label}
                    {cat.itemCount > 0 && (
                      <span className="ml-1 text-[11px] text-[var(--text-muted)]">
                        ({cat.itemCount})
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[12px] text-[var(--text-primary)]">
                    {formatTokens(cat.calibratedTokens)}
                  </span>
                  <span className="w-11 text-right font-mono text-[11px] text-[var(--text-muted)]">
                    {cat.percent.toFixed(1)}%
                  </span>
                  {hasDetails && (
                    <span className="text-[var(--text-muted)]">
                      {isOpen ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </span>
                  )}
                </button>

                {isOpen && cat.details && (
                  <div className="bg-[var(--bg-canvas)]/70 border-t border-[var(--border-hairline)] px-3 py-1.5 space-y-1 max-h-48 overflow-y-auto">
                    {cat.details.map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={!item.entryId}
                        onClick={() => item.entryId && highlightEntry(item.entryId)}
                        className={`flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-[11.5px] ${
                          item.entryId
                            ? 'hover:bg-[var(--bg-subtle)] cursor-pointer'
                            : 'cursor-default'
                        }`}
                      >
                        <span className="truncate text-[var(--text-secondary)]">
                          {item.label}
                          {item.sublabel && (
                            <span className="ml-1.5 text-[10.5px] text-[var(--text-muted)]">
                              {item.sublabel}
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-[11px] text-[var(--text-primary)] shrink-0">
                          ~{formatTokens(item.tokens)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Top 5 Heaviest Contributors */}
      {breakdown.topItems.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Top Context Consumers
          </div>
          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] divide-y divide-[var(--border-hairline)]">
            {breakdown.topItems.map((item, idx) => (
              <button
                key={idx}
                type="button"
                disabled={!item.entryId}
                onClick={() => item.entryId && highlightEntry(item.entryId)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12px] ${
                  item.entryId ? 'hover:bg-[var(--bg-subtle)]/60 cursor-pointer' : 'cursor-default'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[item.category] }}
                  />
                  <span className="truncate text-[var(--text-primary)]">{item.label}</span>
                </span>
                <span className="font-mono text-[11.5px] text-[var(--text-secondary)] shrink-0">
                  ~{formatTokens(item.tokens)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Compact Context Action */}
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3 space-y-2.5">
        <div className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
          <Minimize2 className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>Compact Conversation</span>
        </div>
        <input
          value={compactInstructions}
          onChange={(e) => setCompactInstructions(e.target.value)}
          placeholder="Optional focus (e.g. keep API schema decisions)…"
          className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]"
        />
        <button
          type="button"
          disabled={compacting || activeSession.isStreaming}
          onClick={() => void handleCompact()}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-45 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {compacting ? 'Compacting…' : 'Compact Now'}
        </button>
      </div>
    </div>
  );
};
