type AlternateBufferKeyEvent = {
  ctrl?: boolean;
  name?: string;
  sequence?: string;
};

export type AlternateBufferCompletionPayload = {
  nextSteps?: string[];
  optionalLines?: string[];
  optionalNote?: string;
  optionalTitle?: string;
  preambleLines?: string[];
  summaryLines?: string[];
  title: string;
  warningLines?: string[];
};

export type AlternateBufferProgressPayload = {
  description?: string;
  title: string;
};

type AlternateBufferFailureOptions = {
  context: string;
  error: unknown;
  exit: () => void;
  log?: (message: string) => void;
};

type RunAlternateBufferActionOptions = {
  action: () => Promise<unknown>;
  context: string;
  exit: () => void;
  exitOnSuccess?: boolean;
  log?: (message: string) => void;
  onSuccess?: (result: unknown) => void;
};

export function describeAlternateBufferFailure(
  context: string,
  error: unknown,
): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${context}: ${message}`;
}

export function isAlternateBufferExitKey(
  key: AlternateBufferKeyEvent,
): boolean {
  return key.name === 'q' || (key.ctrl === true && key.name === 'c');
}

export function isAlternateBufferCompletionKey(
  key: AlternateBufferKeyEvent,
): boolean {
  return key.name === 'enter' || key.sequence === '\r' || key.sequence === '\n';
}

export function reportAlternateBufferFailure({
  context,
  error,
  exit,
  log = console.error,
}: AlternateBufferFailureOptions): void {
  const message = describeAlternateBufferFailure(context, error);
  exit();
  log(message);
}

export async function runAlternateBufferAction({
  action,
  context,
  exit,
  exitOnSuccess = true,
  log = console.error,
  onSuccess,
}: RunAlternateBufferActionOptions): Promise<void> {
  try {
    const result = await action();
    onSuccess?.(result);
    if (exitOnSuccess) {
      exit();
    }
  } catch (error) {
    reportAlternateBufferFailure({ context, error, exit, log });
  }
}
