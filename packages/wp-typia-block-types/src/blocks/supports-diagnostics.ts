import type { WordPressBlockApiCompatibilityDiagnostic } from './compatibility.js';
import { handleDiagnostics } from './shared/diagnostics.js';
import type { DefineSupportsOptions } from './supports.js';

export function handleDefineSupportsDiagnostics(
  diagnostics: readonly WordPressBlockApiCompatibilityDiagnostic[],
  onDiagnostic: DefineSupportsOptions['onDiagnostic'],
  logger: DefineSupportsOptions['logger'],
): void {
  handleDiagnostics(diagnostics, onDiagnostic, {
    failureHeading: 'WordPress block supports compatibility check failed:',
    logger,
  });
}
