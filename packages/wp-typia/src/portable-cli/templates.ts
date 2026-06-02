import {
  CLI_DIAGNOSTIC_CODES,
  createCliCommandError,
} from '@wp-typia/project-tools/cli-diagnostics';
import {
  getTemplateById,
  listTemplates,
} from '@wp-typia/project-tools/cli-templates';
import { executeTemplatesCommand } from '../runtime-bridge';
import type { PortableCliDispatchContext, PortableCliGlobalFlags } from './types';

function renderPortableCliTemplatesJson(
  printLine: PortableCliDispatchContext['printLine'],
  flags: PortableCliGlobalFlags,
  subcommand: string,
) {
  if (subcommand === 'list') {
    printLine(
      JSON.stringify(
        {
          templates: listTemplates(),
        },
        null,
        2,
      ),
    );
    return;
  }

  const templateId = flags.id;
  if (!templateId) {
    throw createCliCommandError({
      code: CLI_DIAGNOSTIC_CODES.MISSING_ARGUMENT,
      command: 'templates',
      detailLines: ['`wp-typia templates inspect` requires <template-id>.'],
    });
  }
  const template = getTemplateById(templateId);
  if (!template) {
    throw createCliCommandError({
      code: CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      command: 'templates',
      detailLines: [`Unknown template "${templateId}".`],
    });
  }
  printLine(
    JSON.stringify(
      {
        template,
      },
      null,
      2,
    ),
  );
}

export async function dispatchPortableCliTemplates({
  mergedFlags,
  positionals,
  printLine,
}: PortableCliDispatchContext): Promise<void> {
  const subcommand = positionals[1];
  const templateId =
    typeof mergedFlags.id === 'string'
      ? mergedFlags.id
      : (positionals[2] as string | undefined);
  const resolvedSubcommand = subcommand ?? (templateId ? 'inspect' : 'list');
  if (resolvedSubcommand !== 'list' && resolvedSubcommand !== 'inspect') {
    throw createCliCommandError({
      code: CLI_DIAGNOSTIC_CODES.INVALID_COMMAND,
      command: 'templates',
      detailLines: [
        `Unknown templates subcommand "${resolvedSubcommand}". Expected list or inspect.`,
      ],
    });
  }
  if (mergedFlags.format === 'json') {
    renderPortableCliTemplatesJson(
      printLine,
      {
        format: mergedFlags.format as string | undefined,
        id: templateId,
      },
      resolvedSubcommand,
    );
    return;
  }
  await executeTemplatesCommand(
    {
      flags: {
        id: templateId,
        subcommand: resolvedSubcommand,
      },
    },
    printLine,
  );
}
