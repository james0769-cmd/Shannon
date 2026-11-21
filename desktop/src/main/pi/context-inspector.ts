import { basename } from 'node:path';
import type {
  AgentSession,
  DefaultResourceLoader,
} from '@earendil-works/pi-coding-agent';
import {
  estimateTokens,
  formatSkillsForPrompt,
} from '@earendil-works/pi-coding-agent';
import type {
  ContextBreakdown,
  ContextCategory,
  ContextCategoryDetailItem,
  ContextCategoryKey,
  ContextTopItem,
} from '../../shared/types.js';

const BUILTIN_TOOL_NAMES = new Set([
  'read',
  'bash',
  'edit',
  'write',
  'grep',
  'find',
  'ls',
  'powershell',
]);

function estimateStringTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function getToolSource(name: string): { source: 'builtin' | 'mcp' | 'extension'; mcpServer?: string } {
  if (BUILTIN_TOOL_NAMES.has(name)) {
    return { source: 'builtin' };
  }
  if (name.startsWith('mcp__')) {
    const rest = name.slice('mcp__'.length);
    const sepIdx = rest.indexOf('__');
    const server = sepIdx > 0 ? rest.slice(0, sepIdx) : 'mcp';
    return { source: 'mcp', mcpServer: server };
  }
  return { source: 'extension' };
}

export function buildContextBreakdown(
  session: AgentSession,
  resourceLoader: DefaultResourceLoader,
): ContextBreakdown {
  const contextUsage = session.getContextUsage();
  const stats = session.getSessionStats();
  const contextWindow = contextUsage?.contextWindow ?? session.model?.contextWindow ?? 128000;

  // 1. Project instructions (AGENTS.md / CLAUDE.md)
  const { agentsFiles } = resourceLoader.getAgentsFiles();
  let agentsChars = 0;
  const agentsDetails: ContextCategoryDetailItem[] = agentsFiles.map((file) => {
    agentsChars += file.content.length;
    return {
      label: basename(file.path),
      sublabel: file.path,
      tokens: estimateStringTokens(file.content),
    };
  });
  const agentsTokens = agentsDetails.reduce((sum, item) => sum + item.tokens, 0);

  // 2. Skills block
  const { skills } = resourceLoader.getSkills();
  const skillsPromptText = formatSkillsForPrompt(skills);
  const skillsTokens = estimateStringTokens(skillsPromptText);
  const skillsDetails: ContextCategoryDetailItem[] = skills.map((skill) => ({
    label: skill.name,
    sublabel: skill.description.slice(0, 80),
    tokens: estimateStringTokens(`${skill.name} ${skill.description} ${skill.filePath}`),
  }));

  // 3. Base system prompt (strip estimated project instructions + skills length)
  const fullSystemPrompt = session.systemPrompt || '';
  const baseSystemChars = Math.max(0, fullSystemPrompt.length - agentsChars - skillsPromptText.length);
  const systemPromptTokens = estimateStringTokens('x'.repeat(baseSystemChars));

  // 4. Tools & MCP schemas
  const activeToolSet = new Set(session.getActiveToolNames());
  const allTools = session.getAllTools();
  const builtinToolDetails: ContextCategoryDetailItem[] = [];
  const mcpServerTotals = new Map<string, { tokens: number; count: number }>();
  const mcpToolDetails: ContextCategoryDetailItem[] = [];
  const extensionToolDetails: ContextCategoryDetailItem[] = [];

  for (const tool of allTools) {
    if (!activeToolSet.has(tool.name)) continue;
    const serialized = JSON.stringify({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    });
    const tokens = estimateStringTokens(serialized);
    const { source, mcpServer } = getToolSource(tool.name);

    if (source === 'builtin') {
      builtinToolDetails.push({ label: tool.name, tokens });
    } else if (source === 'mcp') {
      const serverName = mcpServer ?? 'mcp';
      const current = mcpServerTotals.get(serverName) ?? { tokens: 0, count: 0 };
      current.tokens += tokens;
      current.count += 1;
      mcpServerTotals.set(serverName, current);
      mcpToolDetails.push({ label: tool.name, sublabel: `MCP: ${serverName}`, tokens });
    } else {
      extensionToolDetails.push({ label: tool.name, tokens });
    }
  }

  const builtinToolsTokens = builtinToolDetails.reduce((s, d) => s + d.tokens, 0);
  const mcpToolsTokens = mcpToolDetails.reduce((s, d) => s + d.tokens, 0);
  const extensionToolsTokens = extensionToolDetails.reduce((s, d) => s + d.tokens, 0);

  // 5. Active branch messages from SessionProjection
  const projection = session.sessionManager.buildSessionProjection();
  let compactionTokens = 0;
  let compactionCount = 0;
  let userTokens = 0;
  let userCount = 0;
  let assistantTokens = 0;
  let assistantCount = 0;
  let toolResultTokens = 0;
  let toolResultCount = 0;
  let bashInContextTokens = 0;
  let bashInContextCount = 0;
  let excludedBashCount = 0;

  const userDetails: ContextCategoryDetailItem[] = [];
  const assistantDetails: ContextCategoryDetailItem[] = [];
  const toolResultDetails: ContextCategoryDetailItem[] = [];
  const bashDetails: ContextCategoryDetailItem[] = [];
  const topCandidates: ContextTopItem[] = [];

  for (const projected of projection.entries) {
    const entryId = projected.sourceEntry.id;
    const sourceType = projected.sourceEntry.type;

    for (const msg of projected.messages) {
      const role = (msg as { role: string }).role;
      let tok = estimateTokens(msg);

      if (sourceType === 'compaction' || sourceType === 'branch_summary' || role === 'compactionSummary' || role === 'branchSummary') {
        compactionTokens += tok;
        compactionCount++;
        topCandidates.push({
          label: sourceType === 'branch_summary' ? 'Branch Summary' : 'Compaction Summary',
          category: 'compaction_summary',
          tokens: tok,
          entryId,
        });
        continue;
      }

      if (role === 'bashExecution') {
        const bashMsg = msg as unknown as {
          command?: string;
          output?: string;
          excludeFromContext?: boolean;
        };
        if (bashMsg.excludeFromContext) {
          excludedBashCount++;
          continue;
        }
        tok = estimateStringTokens(`Ran \`${bashMsg.command ?? ''}\`\n\`\`\`\n${bashMsg.output ?? ''}\n\`\`\``);
        bashInContextTokens += tok;
        bashInContextCount++;
        const label = `!${(bashMsg.command ?? '').slice(0, 48)}`;
        bashDetails.push({ label, tokens: tok, entryId });
        topCandidates.push({ label, category: 'bash_in_context', tokens: tok, entryId });
        continue;
      }

      if (role === 'user') {
        const userMsg = msg as { content?: string | Array<{ type: string; text?: string }> };
        if (Array.isArray(userMsg.content)) {
          const imageCount = userMsg.content.filter((c) => c.type === 'image').length;
          tok += imageCount * 1600;
        }
        const preview =
          typeof userMsg.content === 'string'
            ? userMsg.content
            : Array.isArray(userMsg.content)
              ? userMsg.content.find((c) => c.type === 'text')?.text ?? '[image]'
              : '';
        userTokens += tok;
        userCount++;
        const label = preview.replace(/\s+/g, ' ').trim().slice(0, 48) || 'User message';
        userDetails.push({ label, tokens: tok, entryId });
        topCandidates.push({ label: `User: ${label}`, category: 'user_messages', tokens: tok, entryId });
        continue;
      }

      if (role === 'assistant') {
        assistantTokens += tok;
        assistantCount++;
        const aMsg = msg as { content?: Array<{ type: string; text?: string }> };
        const firstText = Array.isArray(aMsg.content)
          ? aMsg.content.find((b) => b.type === 'text')?.text ?? '[tool calls / thinking]'
          : '';
        const label = firstText.replace(/\s+/g, ' ').trim().slice(0, 48) || 'Assistant';
        assistantDetails.push({ label, tokens: tok, entryId });
        topCandidates.push({ label: `Assistant: ${label}`, category: 'assistant_messages', tokens: tok, entryId });
        continue;
      }

      if (role === 'toolResult') {
        const tr = msg as { toolName?: string };
        toolResultTokens += tok;
        toolResultCount++;
        const label = `Tool result: ${tr.toolName ?? 'tool'}`;
        toolResultDetails.push({ label, tokens: tok, entryId });
        topCandidates.push({ label, category: 'tool_results', tokens: tok, entryId });
      }
    }
  }

  for (const [server, info] of mcpServerTotals.entries()) {
    topCandidates.push({
      label: `MCP server: ${server} (${info.count} tools)`,
      category: 'tools_mcp',
      tokens: info.tokens,
    });
  }
  for (const file of agentsDetails) {
    topCandidates.push({
      label: `Instructions: ${file.label}`,
      category: 'project_instructions',
      tokens: file.tokens,
    });
  }

  const rawCategories: Array<{
    key: ContextCategoryKey;
    label: string;
    estimatedTokens: number;
    itemCount: number;
    details?: ContextCategoryDetailItem[];
  }> = [
    {
      key: 'system_prompt',
      label: 'System Prompt',
      estimatedTokens: systemPromptTokens,
      itemCount: systemPromptTokens > 0 ? 1 : 0,
    },
    {
      key: 'project_instructions',
      label: 'Project Instructions',
      estimatedTokens: agentsTokens,
      itemCount: agentsDetails.length,
      details: agentsDetails,
    },
    {
      key: 'skills',
      label: 'Skills',
      estimatedTokens: skillsTokens,
      itemCount: skillsDetails.length,
      details: skillsDetails,
    },
    {
      key: 'tools_builtin',
      label: 'Built-in Tools',
      estimatedTokens: builtinToolsTokens,
      itemCount: builtinToolDetails.length,
      details: builtinToolDetails,
    },
    {
      key: 'tools_mcp',
      label: 'MCP Tools',
      estimatedTokens: mcpToolsTokens,
      itemCount: mcpToolDetails.length,
      details: mcpToolDetails,
    },
    {
      key: 'tools_extension',
      label: 'Extension Tools',
      estimatedTokens: extensionToolsTokens,
      itemCount: extensionToolDetails.length,
      details: extensionToolDetails,
    },
    {
      key: 'compaction_summary',
      label: 'Compaction & Branch Summaries',
      estimatedTokens: compactionTokens,
      itemCount: compactionCount,
    },
    {
      key: 'user_messages',
      label: 'User Messages',
      estimatedTokens: userTokens,
      itemCount: userCount,
      details: userDetails,
    },
    {
      key: 'assistant_messages',
      label: 'Assistant & Thinking',
      estimatedTokens: assistantTokens,
      itemCount: assistantCount,
      details: assistantDetails,
    },
    {
      key: 'tool_results',
      label: 'Tool Results',
      estimatedTokens: toolResultTokens,
      itemCount: toolResultCount,
      details: toolResultDetails,
    },
    {
      key: 'bash_in_context',
      label: '!bash Output (In Context)',
      estimatedTokens: bashInContextTokens,
      itemCount: bashInContextCount,
      details: bashDetails,
    },
  ];

  const estimatedTotalTokens = rawCategories.reduce((sum, c) => sum + c.estimatedTokens, 0);
  const apiTokens = contextUsage?.tokens ?? null;
  const isApiMeasured = apiTokens !== null && apiTokens > 0;
  const effectiveTotal = isApiMeasured ? apiTokens : estimatedTotalTokens;
  const scaleFactor =
    isApiMeasured && estimatedTotalTokens > 0 ? apiTokens / estimatedTotalTokens : 1;

  const categories: ContextCategory[] = rawCategories.map((c) => {
    const calibratedTokens = Math.round(c.estimatedTokens * scaleFactor);
    const percent = contextWindow > 0 ? (calibratedTokens / contextWindow) * 100 : 0;
    return {
      key: c.key,
      label: c.label,
      estimatedTokens: c.estimatedTokens,
      calibratedTokens,
      percent: Number(percent.toFixed(2)),
      itemCount: c.itemCount,
      details: c.details?.sort((a, b) => b.tokens - a.tokens),
    };
  });

  const percent =
    contextUsage?.percent !== undefined && contextUsage?.percent !== null
      ? Number(contextUsage.percent.toFixed(1))
      : contextWindow > 0
        ? Number(((effectiveTotal / contextWindow) * 100).toFixed(1))
        : null;

  const remainingTokens =
    contextWindow > 0 ? Math.max(0, contextWindow - effectiveTotal) : null;

  const topItems = topCandidates
    .filter((i) => i.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 5);

  return {
    totalTokens: effectiveTotal,
    isApiMeasured,
    estimatedTotalTokens,
    contextWindow,
    percent,
    remainingTokens,
    categories,
    excludedBashCount,
    topItems,
    systemPromptPreview: fullSystemPrompt.slice(0, 4000),
    sessionStats: {
      userMessages: stats.userMessages,
      assistantMessages: stats.assistantMessages,
      toolCalls: stats.toolCalls,
      toolResults: stats.toolResults,
      totalMessages: stats.totalMessages,
      tokens: stats.tokens,
      cost: stats.cost,
    },
  };
}
