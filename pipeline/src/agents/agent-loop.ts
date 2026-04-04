import Anthropic from '@anthropic-ai/sdk';
import type { PipelineConfig } from '../types.js';
import { executeTool } from './tools.js';

interface AgentConfig {
  name: string;
  systemPrompt: string;
  tools: Anthropic.Tool[];
  maxTurns: number;
}

/**
 * Generic agentic loop that runs a Claude-powered agent with tools.
 * The agent calls tools autonomously until it decides it's done.
 */
export async function runAgent(
  agentConfig: AgentConfig,
  userPrompt: string,
  pipelineConfig: PipelineConfig
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userPrompt },
  ];

  console.log(`\n🤖 [${agentConfig.name}] A iniciar...`);

  let turns = 0;

  while (turns < agentConfig.maxTurns) {
    turns++;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: agentConfig.systemPrompt,
      tools: agentConfig.tools,
      thinking: { type: 'adaptive' },
      messages,
    });

    // Check if done
    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text'
      );
      const result = textBlock?.text || '';
      console.log(`✓ [${agentConfig.name}] Concluído (${turns} turnos)`);
      return result;
    }

    // Extract tool calls
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );

    if (toolUseBlocks.length === 0) {
      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text'
      );
      return textBlock?.text || '';
    }

    // Log what the agent is doing
    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        console.log(`  [${agentConfig.name}] ${block.text.slice(0, 100)}`);
      }
    }

    // Append assistant message with all content
    messages.push({ role: 'assistant', content: response.content });

    // Execute all tool calls
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      console.log(`  🔧 [${agentConfig.name}] ${toolUse.name}(${JSON.stringify(toolUse.input).slice(0, 80)})`);

      const result = await executeTool(
        toolUse.name,
        toolUse.input as Record<string, unknown>,
        pipelineConfig
      );

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  console.log(`⚠️  [${agentConfig.name}] Atingido limite de ${agentConfig.maxTurns} turnos`);
  return `Agent reached max turns (${agentConfig.maxTurns})`;
}
