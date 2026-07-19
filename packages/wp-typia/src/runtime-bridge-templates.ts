import {
  CLI_DIAGNOSTIC_CODES,
  createCliDiagnosticCodeError,
} from '@wp-typia/project-tools/cli-diagnostics';
import { printBlock } from './runtime-bridge-output';
import type { PrintLine } from './print-line';

export type TemplatesExecutionInput = {
  flags: {
    id?: string;
    subcommand?: string;
  };
};

const loadCliTemplatesRuntime = () =>
  import('@wp-typia/project-tools/cli-templates');

export async function executeTemplatesCommand(
  { flags }: TemplatesExecutionInput,
  printLine: PrintLine = console.log,
): Promise<void> {
  const {
    formatTemplateDetails,
    formatTemplateFeatures,
    formatTemplateSummary,
    getTemplateById,
    listTemplates,
  } = await loadCliTemplatesRuntime();
  const subcommand = flags.subcommand ?? 'list';

  if (subcommand === 'list') {
    for (const template of listTemplates()) {
      printBlock(
        printLine,
        [formatTemplateSummary(template), formatTemplateFeatures(template)],
      );
    }
    return;
  }

  if (subcommand === 'inspect') {
    if (!flags.id) {
      throw createCliDiagnosticCodeError(
        CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
        '`wp-typia templates inspect` requires <template-id>.',
      );
    }
    const template = getTemplateById(flags.id);
    if (!template) {
      throw createCliDiagnosticCodeError(
        CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
        `Unknown template "${flags.id}".`,
      );
    }
    printBlock(printLine, [formatTemplateDetails(template)]);
    return;
  }

  throw createCliDiagnosticCodeError(
    CLI_DIAGNOSTIC_CODES.INVALID_COMMAND,
    `Unknown templates subcommand "${subcommand}". Expected list or inspect.`,
  );
}

export async function listTemplatesForRuntime() {
  const { listCliTemplateMetadata } = await loadCliTemplatesRuntime();
  return listCliTemplateMetadata();
}
