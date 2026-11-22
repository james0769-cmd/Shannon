import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Minimize2, Sparkles } from 'lucide-react';
import type {
  ContextCategory,
  ContextCategoryDetailItem,
  ContextCategoryKey,
} from '@shared/types';
import { useAppStore } from '../../stores/app-store.js';

const TONE_VARS = [
  'var(--ctx-tone-2)',
  'var(--ctx-tone-3)',
  'var(--ctx-tone-4)',
  'var(--ctx-tone-5)',
  'var(--ctx-tone-6)',
];

const MESSAGE_SUBCATEGORIES: Array<{ key: ContextCategoryKey; label: string }> = [
  { key: 'user_messages', label: 'User messages' },
  { key: 'assistant_messages', label: 'Assistant & Thinking' },
  { key: 'tool_results', label: 'Tool results' },
  { key: 'bash_in_context', label: '!bash output' },
  { key: 'compaction_summary', label: 'Compaction summary' },
];

const COMPONENT_SPECS: Array<{
  key: ContextCategoryKey;
  label: string;
  alwaysShow: boolean;
}> = [
  { key: 'tools_builtin', label: 'System tools', alwaysShow: true },
  { key: 'system_prompt', label: 'System prompt', alwaysShow: true },
  { key: 'project_instructions', label: 'Project instructions', alwaysShow: false },
  { key: 'skills', label: 'Skills', alwaysShow: true },
  { key: 'tools_mcp', label: 'MCP tools', alwaysShow: true },
  { key: 'tools_extension', label: 'Extension tools', alwaysShow: false },
];

const TOOL_CATEGORY_KEYS = new Set<string>(['tools_builtin', 'tools_mcp', 'tools_extension']);

interface SwatchRowModel {
  id: string;
  label: string;
  tokens: number;
  percent: number;
  color: string;
  expandable: boolean;
  details?: ContextCategoryDetailItem[];
  systemPromptPreview?: string;
}

interface CombinedToolItem {
  label: string;
  sublabel?: string;
  tokens: number;
  sourceTag: 'built-in' | 'MCP' | 'ext';
}

function formatTokens(n: number | null): string {
  if (n === null) return '—';
  if (n === 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export const ContextPanel: React.FC = () => {
  const { activeSession, compactActiveSession, highlightEntry } = useAppStore();
  const [breakdownOpen, setBreakdownOpen] = useState(true);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [compactInstructions, setCompactInstructions] = useState('');
  const [compacting, setCompacting] = useState(false);

  const breakdown = activeSession?.contextBreakdown;

  const {
    usedRows,
    freeRow,
    messageSubCategories,
    allTools,
    totalToolTokens,
    topItemsTokens,
  } = useMemo(() => {
    if (!breakdown) {
      return {
        usedRows: [] as SwatchRowModel[],
        freeRow: null as SwatchRowModel | null,
        messageSubCategories: [] as Array<{
          key: ContextCategoryKey;
          label: string;
          tokens: number;
          percent: number;
          details: ContextCategoryDetailItem[];
        }>,
        allTools: [] as CombinedToolItem[],
        totalToolTokens: 0,
        topItemsTokens: 0,
      };
    }

    const catMap = new Map<ContextCategoryKey, ContextCategory>();
    for (const cat of breakdown.categories) {
      catMap.set(cat.key, cat);
    }

    const ctxWin = breakdown.contextWindow;

    // 1. Messages aggregate row
    const subCats = MESSAGE_SUBCATEGORIES.map((spec) => {
      const cat = catMap.get(spec.key);
      const tokens = cat?.calibratedTokens ?? 0;
      return {
        key: spec.key,
        label: spec.label,
        tokens,
        percent: cat?.percent ?? 0,
        details: cat?.details ?? [],
      };
    }).filter((s) => s.tokens > 0 || s.details.length > 0);

    const messagesTokens = MESSAGE_SUBCATEGORIES.reduce(
      (sum, spec) => sum + (catMap.get(spec.key)?.calibratedTokens ?? 0),
      0,
    );
    const messagesPercent = ctxWin > 0 ? (messagesTokens / ctxWin) * 100 : 0;

    const rows: SwatchRowModel[] = [
      {
        id: 'messages',
        label: 'Messages',
        tokens: messagesTokens,
        percent: messagesPercent,
        color: 'var(--ctx-tone-1)',
        expandable: subCats.length > 0,
      },
    ];

    // 2. Stepped blue component rows
    let toneIdx = 0;
    for (const spec of COMPONENT_SPECS) {
      const cat = catMap.get(spec.key);
      const tokens = cat?.calibratedTokens ?? 0;
      const itemCount = cat?.itemCount ?? 0;
      if (!spec.alwaysShow && tokens === 0 && itemCount === 0) {
        continue;
      }

      const color = TONE_VARS[Math.min(toneIdx, TONE_VARS.length - 1)];
      toneIdx += 1;

      const isSystemPrompt = spec.key === 'system_prompt';
      const promptPreview = isSystemPrompt ? breakdown.systemPromptPreview : undefined;
      const details = cat?.details ?? [];

      rows.push({
        id: spec.key,
        label: spec.label,
        tokens,
        percent: cat?.percent ?? 0,
        color,
        expandable: isSystemPrompt ? Boolean(promptPreview) : details.length > 0,
        details: isSystemPrompt ? undefined : details,
        systemPromptPreview: promptPreview,
      });
    }

    // 3. Free space row
    const freeTokens = breakdown.remainingTokens ?? 0;
    const freePercent =
      ctxWin > 0 && breakdown.remainingTokens !== null
        ? (breakdown.remainingTokens / ctxWin) * 100
        : 0;

    const free: SwatchRowModel = {
      id: 'free_space',
      label: 'Free space',
      tokens: freeTokens,
      percent: freePercent,
      color: 'var(--ctx-free)',
      expandable: false,
    };

    // 4. Combined active tools for disclosure row
    const toolSources: Array<{ key: ContextCategoryKey; tag: 'built-in' | 'MCP' | 'ext' }> = [
      { key: 'tools_builtin', tag: 'built-in' },
      { key: 'tools_mcp', tag: 'MCP' },
      { key: 'tools_extension', tag: 'ext' },
    ];
    const combinedTools: CombinedToolItem[] = [];
    let toolTokenSum = 0;
    for (const { key, tag } of toolSources) {
      const cat = catMap.get(key);
      if (!cat) continue;
      toolTokenSum += cat.calibratedTokens;
      for (const item of cat.details ?? []) {
        combinedTools.push({
          label: item.label,
          sublabel: item.sublabel,
          tokens: item.tokens,
          sourceTag: tag,
        });
      }
    }
    combinedTools.sort((a, b) => b.tokens - a.tokens);

    const topTokensSum = breakdown.topItems.reduce((sum, item) => sum + item.tokens, 0);

    return {
      usedRows: rows,
      freeRow: free,
      messageSubCategories: subCats,
      allTools: combinedTools,
      totalToolTokens: toolTokenSum,
      topItemsTokens: topTokensSum,
    };
  }, [breakdown]);

  if (!activeSession || !breakdown) {
    return (
      <div className="px-3 py-3 text-[12px] text-[var(--text-muted)]">
        Open or start a chat to inspect context breakdown.
      </div>
    );
  }

  const toggleKey = (key: string) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCompact = async () => {
    setCompacting(true);
    try {
      await compactActiveSession(compactInstructions);
      setCompactInstructions('');
    } finally {
      setCompacting(false);
    }
  };

  const { tokens: totalStats, cost } = breakdown.sessionStats;
  const cacheDenominator = totalStats.input + totalStats.cacheRead;
  const cacheHitPct =
    cacheDenominator > 0 ? Math.round((totalStats.cacheRead / cacheDenominator) * 100) : 0;

  const renderDetailItems = (details: ContextCategoryDetailItem[]) => (
    <div className="ml-4 mr-1 mb-1.5 max-h-44 overflow-y-auto border-l border-[var(--border-hairline)] pl-2 pr-0.5 space-y-px">
      {details.map((item, idx) => (
        <button
          key={`${item.label}-${idx}`}
          type="button"
          disabled={!item.entryId}
          onClick={() => item.entryId && highlightEntry(item.entryId)}
          className={`flex w-full items-center justify-between gap-2 rounded px-1 py-[3px] text-left text-[11px] ${
            item.entryId ? 'hover:bg-[var(--bg-hover)] cursor-pointer' : 'cursor-default'
          }`}
        >
          <span className="truncate text-[var(--text-secondary)]">
            {item.label}
            {item.sublabel && (
              <span className="ml-1.5 text-[10px] text-[var(--text-muted)]">
                {item.sublabel}
              </span>
            )}
          </span>
          <span className="shrink-0 tabular-nums text-[10.5px] text-[var(--text-primary)]">
            ~{formatTokens(item.tokens)}
          </span>
        </button>
      ))}
    </div>
  );

  // Tool categories stay in the bar, but are listed once under the Tools disclosure.
  const listRows = usedRows.filter((r) => !TOOL_CATEGORY_KEYS.has(r.id));
  const allSwatchRows = freeRow ? [...listRows, freeRow] : listRows;
  const barSegments = usedRows.filter((r) => r.tokens > 0);
  const toolsDisclosureOpen = Boolean(expandedKeys['disclosure:tools']);
  const topDisclosureOpen = Boolean(expandedKeys['disclosure:top']);

  return (
    <div className="px-3 py-2 pb-4">
      {/* Section 1: Context window */}
      <div>
        <button
          type="button"
          onClick={() => setBreakdownOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-[var(--bg-hover)]/50 cursor-pointer"
        >
          <span className="text-[12.5px] text-[var(--text-secondary)]">Context window</span>
          <span className="flex items-center gap-1.5 tabular-nums text-[12.5px] text-[var(--text-secondary)]">
            <span>
              {formatTokens(breakdown.totalTokens)} / {formatTokens(breakdown.contextWindow)} (
              {Math.round(breakdown.percent ?? 0)}%)
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform ${
                breakdownOpen ? '' : '-rotate-90'
              }`}
            />
          </span>
        </button>

        {/* Thin Monochromatic Segmented Bar */}
        <div className="px-1.5 pb-2">
          <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--ctx-bar-track)] flex">
            {barSegments.map((seg) => (
              <div
                key={seg.id}
                style={{
                  width: `${Math.max(0.4, seg.percent)}%`,
                  backgroundColor: seg.color,
                }}
                title={`${seg.label}: ${formatTokens(seg.tokens)} (${seg.percent.toFixed(1)}%)`}
              />
            ))}
          </div>
        </div>

        {breakdownOpen && (
          <div className="pb-1 space-y-px">
            {allSwatchRows.map((row) => {
              const isOpen = Boolean(expandedKeys[row.id]);
              return (
                <div key={row.id}>
                  <button
                    type="button"
                    disabled={!row.expandable}
                    onClick={() => row.expandable && toggleKey(row.id)}
                    className={`flex w-full items-center gap-2 rounded px-1.5 py-[3px] text-left transition-colors ${
                      row.expandable
                        ? 'hover:bg-[var(--bg-hover)]/60 cursor-pointer'
                        : 'cursor-default'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 shrink-0 flex items-center justify-center">
                      <span
                        className="h-2 w-2 rounded-[2px]"
                        style={{ backgroundColor: row.color }}
                      />
                    </span>
                    <span className="flex-1 min-w-0 truncate text-[12.5px] text-[var(--text-primary)]">
                      {row.label}
                    </span>
                    <span className="shrink-0 text-right tabular-nums text-[11.5px] text-[var(--text-secondary)]">
                      {formatTokens(row.tokens)}
                    </span>
                    <span className="w-10 shrink-0 text-right tabular-nums text-[11.5px] text-[var(--text-primary)]">
                      {row.percent.toFixed(1)}%
                    </span>
                  </button>

                  {isOpen && row.id === 'messages' && messageSubCategories.length > 0 && (
                    <div className="ml-4 mr-1 mb-1.5 border-l border-[var(--border-hairline)] pl-2 space-y-px">
                      {messageSubCategories.map((sub) => {
                        const subKey = `sub:${sub.key}`;
                        const subOpen = Boolean(expandedKeys[subKey]);
                        const hasSubDetails = sub.details.length > 0;
                        return (
                          <div key={sub.key}>
                            <button
                              type="button"
                              disabled={!hasSubDetails}
                              onClick={() => hasSubDetails && toggleKey(subKey)}
                              className={`flex w-full items-center gap-1.5 rounded px-1 py-[3px] text-left text-[11.5px] ${
                                hasSubDetails
                                  ? 'hover:bg-[var(--bg-hover)]/60 cursor-pointer'
                                  : 'cursor-default'
                              }`}
                            >
                              <span className="w-3 h-3 shrink-0 flex items-center justify-center text-[var(--text-muted)]">
                                {hasSubDetails &&
                                  (subOpen ? (
                                    <ChevronDown className="w-2.5 h-2.5" />
                                  ) : (
                                    <ChevronRight className="w-2.5 h-2.5" />
                                  ))}
                              </span>
                              <span className="flex-1 min-w-0 truncate text-[var(--text-secondary)]">
                                {sub.label}
                              </span>
                              <span className="shrink-0 text-right tabular-nums text-[11px] text-[var(--text-secondary)]">
                                {formatTokens(sub.tokens)}
                              </span>
                              <span className="w-10 shrink-0 text-right tabular-nums text-[11px] text-[var(--text-primary)]">
                                {sub.percent.toFixed(1)}%
                              </span>
                            </button>
                            {subOpen && hasSubDetails && renderDetailItems(sub.details)}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {isOpen &&
                    row.id === 'system_prompt' &&
                    row.systemPromptPreview && (
                      <pre className="ml-4 mr-1 mb-1.5 max-h-44 overflow-y-auto whitespace-pre-wrap break-words border-l border-[var(--border-hairline)] pl-2 pr-1 font-mono text-[10.5px] leading-relaxed text-[var(--text-secondary)]">
                        {row.systemPromptPreview}
                      </pre>
                    )}

                  {isOpen &&
                    row.id !== 'messages' &&
                    row.id !== 'system_prompt' &&
                    row.details &&
                    row.details.length > 0 &&
                    renderDetailItems(row.details)}
                </div>
              );
            })}

            {/* Disclosure row: Tools */}
            {allTools.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => toggleKey('disclosure:tools')}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-[3px] text-left hover:bg-[var(--bg-hover)]/60 transition-colors cursor-pointer"
                >
                  <span className="w-3 h-3 shrink-0 flex items-center justify-center text-[var(--text-muted)]">
                    {toolsDisclosureOpen ? (
                      <ChevronDown className="w-2.5 h-2.5" />
                    ) : (
                      <ChevronRight className="w-2.5 h-2.5" />
                    )}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-[12.5px] text-[var(--text-primary)]">
                    Tools
                  </span>
                  <span className="shrink-0 text-right tabular-nums text-[11.5px] text-[var(--text-secondary)]">
                    {formatTokens(totalToolTokens)}
                  </span>
                  <span className="w-10 shrink-0 text-right tabular-nums text-[11.5px] text-[var(--text-secondary)]">
                    {allTools.length}
                  </span>
                </button>

                {toolsDisclosureOpen && (
                  <div className="ml-4 mr-1 mb-1.5 max-h-48 overflow-y-auto border-l border-[var(--border-hairline)] pl-2 pr-0.5 space-y-px">
                    {allTools.map((tool, idx) => (
                      <div
                        key={`${tool.label}-${idx}`}
                        className="flex items-center justify-between gap-2 px-1 py-[3px] text-[11px]"
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate font-mono text-[var(--text-primary)]">
                            {tool.label}
                          </span>
                          <span className="shrink-0 rounded bg-[var(--bg-subtle)] px-1 text-[9.5px] text-[var(--text-muted)]">
                            {tool.sourceTag}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums text-[10.5px] text-[var(--text-secondary)]">
                          ~{formatTokens(tool.tokens)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Disclosure row: Top consumers */}
            {breakdown.topItems.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => toggleKey('disclosure:top')}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-[3px] text-left hover:bg-[var(--bg-hover)]/60 transition-colors cursor-pointer"
                >
                  <span className="w-3 h-3 shrink-0 flex items-center justify-center text-[var(--text-muted)]">
                    {topDisclosureOpen ? (
                      <ChevronDown className="w-2.5 h-2.5" />
                    ) : (
                      <ChevronRight className="w-2.5 h-2.5" />
                    )}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-[12.5px] text-[var(--text-primary)]">
                    Top consumers
                  </span>
                  <span className="shrink-0 text-right tabular-nums text-[11.5px] text-[var(--text-secondary)]">
                    {formatTokens(topItemsTokens)}
                  </span>
                  <span className="w-10 shrink-0 text-right tabular-nums text-[11.5px] text-[var(--text-secondary)]">
                    {breakdown.topItems.length}
                  </span>
                </button>

                {topDisclosureOpen && (
                  <div className="ml-4 mr-1 mb-1.5 max-h-48 overflow-y-auto border-l border-[var(--border-hairline)] pl-2 pr-0.5 space-y-px">
                    {breakdown.topItems.map((item, idx) => (
                      <button
                        key={`${item.label}-${idx}`}
                        type="button"
                        disabled={!item.entryId}
                        onClick={() => item.entryId && highlightEntry(item.entryId)}
                        className={`flex w-full items-center justify-between gap-2 px-1 py-[3px] text-left text-[11px] ${
                          item.entryId
                            ? 'hover:bg-[var(--bg-hover)] cursor-pointer'
                            : 'cursor-default'
                        }`}
                      >
                        <span className="truncate text-[var(--text-secondary)]">
                          {item.label}
                        </span>
                        <span className="shrink-0 tabular-nums text-[10.5px] text-[var(--text-primary)]">
                          ~{formatTokens(item.tokens)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Quiet muted row for excluded local !!bash */}
            {breakdown.excludedBashCount > 0 && (
              <div className="flex w-full items-center gap-2 px-1.5 py-[3px] text-[var(--text-muted)]">
                <span className="w-2.5 shrink-0" />
                <span className="flex-1 min-w-0 truncate text-[12px]">Local !!bash</span>
                <span className="shrink-0 text-right tabular-nums text-[11px]">0</span>
                <span className="w-10 shrink-0 text-right tabular-nums text-[11px]">
                  {breakdown.excludedBashCount}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 2: Session usage */}
      <div className="mt-2 border-t border-[var(--border-hairline)] pt-2 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12.5px] text-[var(--text-secondary)]">Session usage</span>
          <span className="text-[11px] text-[var(--text-muted)]">
            {breakdown.isApiMeasured ? 'API measured' : 'Estimated'}
          </span>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-[var(--text-primary)]">Cache hit rate</span>
            <span className="tabular-nums text-[11.5px] text-[var(--text-secondary)]">
              {cacheHitPct}% · {formatTokens(totalStats.cacheRead)} read
            </span>
          </div>

          <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--ctx-bar-track)]">
            <div
              className="h-full rounded-full bg-[var(--ctx-usage-bar)] transition-[width] duration-300"
              style={{ width: `${cacheHitPct}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-[11.5px] text-[var(--text-secondary)] tabular-nums">
          <span>Cost ${cost.toFixed(4)}</span>
          <span>In {formatTokens(totalStats.input)}</span>
          <span>Out {formatTokens(totalStats.output)}</span>
        </div>
      </div>

      {/* Section 3: Compact conversation */}
      <div className="mt-2 border-t border-[var(--border-hairline)] pt-2 space-y-1.5">
        <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
          <Minimize2 className="w-3 h-3 text-[var(--accent)]" />
          <span>Compact conversation</span>
        </div>
        <input
          value={compactInstructions}
          onChange={(e) => setCompactInstructions(e.target.value)}
          placeholder="Optional focus (e.g. keep API schema decisions)…"
          className="w-full rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2 py-1 text-[11.5px] text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]"
        />
        <button
          type="button"
          disabled={compacting || activeSession.isStreaming}
          onClick={() => void handleCompact()}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1 text-[12px] font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-45 cursor-pointer"
        >
          <Sparkles className="w-3 h-3" />
          {compacting ? 'Compacting…' : 'Compact now'}
        </button>
      </div>
    </div>
  );
};
