export type AIAgentInfo = {
  envVars: string[];
  name: string;
  detect: (env: NodeJS.ProcessEnv) => boolean;
};

export type AIAgentDetectionResult = {
  aiAgentEnvVars: string[];
  aiAgents: string[];
  isAIAgent: boolean;
};

export const AI_AGENT_DEFINITIONS = [
  {
    detect: (env) => Boolean(env.CLAUDECODE) || Boolean(env.CLAUDE_CODE),
    envVars: ['CLAUDECODE', 'CLAUDE_CODE'],
    name: 'claude',
  },
  {
    detect: (env) => Boolean(env.CURSOR_AGENT),
    envVars: ['CURSOR_AGENT'],
    name: 'cursor',
  },
  {
    detect: (env) =>
      Boolean(env.CODEX_CI) ||
      Boolean(env.CODEX_THREAD_ID) ||
      Boolean(env.CODEX_SANDBOX),
    envVars: ['CODEX_CI', 'CODEX_THREAD_ID', 'CODEX_SANDBOX'],
    name: 'codex',
  },
  {
    detect: (env) => Boolean(env.AMP_CURRENT_THREAD_ID) || env.AGENT === 'amp',
    envVars: ['AMP_CURRENT_THREAD_ID', 'AGENT'],
    name: 'amp',
  },
  {
    detect: (env) => Boolean(env.GEMINI_CLI),
    envVars: ['GEMINI_CLI'],
    name: 'gemini',
  },
  {
    detect: (env) => env.OPENCODE === '1',
    envVars: ['OPENCODE'],
    name: 'opencode',
  },
] as const satisfies readonly AIAgentInfo[];

export function detectAIAgents(
  env: NodeJS.ProcessEnv = process.env,
  agents: readonly AIAgentInfo[] = AI_AGENT_DEFINITIONS,
): AIAgentDetectionResult {
  const aiAgents: string[] = [];
  const aiAgentEnvVars: string[] = [];

  for (const agent of agents) {
    if (!agent.detect(env)) {
      continue;
    }
    aiAgents.push(agent.name);
    aiAgentEnvVars.push(...agent.envVars.filter((envVar) => Boolean(env[envVar])));
  }

  return {
    aiAgentEnvVars,
    aiAgents,
    isAIAgent: aiAgents.length > 0,
  };
}
