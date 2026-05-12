import Anthropic from '@anthropic-ai/sdk';

/**
 * Run an agent using the SDK's built-in Tool Runner.
 *
 * The Tool Runner handles the agentic loop automatically:
 * 1. Sends the prompt to Claude
 * 2. When Claude calls a tool, executes the tool's `run` function
 * 3. Feeds the result back to Claude
 * 4. Repeats until Claude stops calling tools
 *
 * Each tool is a betaZodTool with its own typed `run` implementation,
 * so there's no separate executeTool switch statement.
 */

interface AgentConfig {
  name: string;
  systemPrompt: string;
  tools: ReturnType<typeof import('@anthropic-ai/sdk/helpers/beta/zod').betaZodTool>[];
  maxTurns?: number;
}

export async function runAgent(
  agentConfig: AgentConfig,
  userPrompt: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const client = new Anthropic({ apiKey });

  console.log(`\n  [${agentConfig.name}] A iniciar...`);

  const runner = client.beta.messages.toolRunner({
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    system: agentConfig.systemPrompt,
    thinking: { type: 'adaptive' },
    tools: agentConfig.tools,
    messages: [{ role: 'user', content: userPrompt }],
  });

  let turns = 0;
  const maxTurns = agentConfig.maxTurns ?? 10;

  for await (const messageStream of runner) {
    turns++;

    for await (const event of messageStream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          console.log(`    [${agentConfig.name}] ${event.content_block.name}(...)`);
        }
      }
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        // Log first 100 chars of text output for visibility
        const text = event.delta.text.trim();
        if (text && text.length > 3) {
          console.log(`  [${agentConfig.name}] ${text.slice(0, 100)}`);
        }
      }
    }

    if (turns >= maxTurns) {
      console.log(`  [${agentConfig.name}] Atingido limite de ${maxTurns} turnos`);
      break;
    }
  }

  const finalMessage = await runner.finalMessage();

  const textBlock = finalMessage.content.find(
    (b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text'
  );

  console.log(`  [${agentConfig.name}] Concluído (${turns} turnos)`);
  return textBlock?.text || '';
}
