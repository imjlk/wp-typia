import {
  detectAIAgents,
  type AIAgentDetectionResult,
} from './ai-agent-detection';

function getExplicitFormat(argv: readonly string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }
    if (arg === '--') {
      return undefined;
    }
    if (arg === '--format') {
      const next = argv[index + 1];
      return next && !next.startsWith('-') ? next : undefined;
    }
    if (arg.startsWith('--format=')) {
      return arg.slice('--format='.length) || undefined;
    }
  }

  return undefined;
}

export function createAIAgentStructuredOutputNotice(
  detection: AIAgentDetectionResult,
): string | undefined {
  if (!detection.isAIAgent) {
    return undefined;
  }

  const agentLabel =
    detection.aiAgents.length > 0 ? detection.aiAgents.join(', ') : 'AI agent';
  const envLabel =
    detection.aiAgentEnvVars.length > 0
      ? ` via ${detection.aiAgentEnvVars.join(', ')}`
      : '';

  return `Detected ${agentLabel}${envLabel}; defaulting to --format json. Pass --format text for human-readable output.`;
}

export function getStructuredOutputNoticesForArgv(
  argv: readonly string[],
): string[] {
  if (getExplicitFormat(argv) !== undefined) {
    return [];
  }

  const notice = createAIAgentStructuredOutputNotice(detectAIAgents());
  return notice ? [notice] : [];
}

export function withStructuredOutputNotices<
  TPayload extends Record<string, unknown>,
>(payload: TPayload, notices: readonly string[] | undefined): TPayload {
  return notices && notices.length > 0
    ? {
        ...payload,
        notices: [...notices],
      }
    : payload;
}
