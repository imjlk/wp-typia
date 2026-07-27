export type DiagnosticSeverity = 'error' | 'warning';

export interface DiagnosticWithMessage {
  readonly message: string;
  readonly severity: DiagnosticSeverity;
}

export interface DiagnosticLogger<
  TDiagnostic extends DiagnosticWithMessage = DiagnosticWithMessage,
> {
  readonly warn: (message: string, diagnostic: TDiagnostic) => void;
}

export function getDiagnosticSeverity(strict: boolean): DiagnosticSeverity {
  return strict ? 'error' : 'warning';
}

export function handleDiagnostics<TDiagnostic extends DiagnosticWithMessage>(
  diagnostics: readonly TDiagnostic[],
  onDiagnostic: ((diagnostic: TDiagnostic) => void) | undefined,
  options: {
    readonly failureHeading: string;
    readonly logger?: DiagnosticLogger<TDiagnostic> | undefined;
  },
): void {
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error',
  );

  if (errors.length > 0) {
    throw new Error(
      [
        options.failureHeading,
        ...errors.map((diagnostic) => `- ${diagnostic.message}`),
      ].join('\n'),
    );
  }

  for (const diagnostic of diagnostics) {
    if (onDiagnostic) {
      onDiagnostic(diagnostic);
      continue;
    }

    options.logger?.warn(`[wp-typia] ${diagnostic.message}`, diagnostic);
  }
}
