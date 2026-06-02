import {
  CLI_DIAGNOSTIC_CODES,
  createCliCommandError,
} from '@wp-typia/project-tools/cli-diagnostics';
import type { DoctorExitPolicy } from '@wp-typia/project-tools/cli-doctor';
import { executeDoctorCommand } from '../runtime-bridge';
import type { PrintLine } from '../print-line';
import type { PortableCliDispatchContext } from './types';

async function renderPortableCliDoctorJson(
  cwd: string,
  exitPolicy: DoctorExitPolicy,
  printLine: PrintLine,
): Promise<void> {
  const {
    createDoctorRunSummary,
    getDoctorChecks,
    getDoctorExitFailureDetailLines,
  } = await import('@wp-typia/project-tools/cli-doctor');
  const checks = await getDoctorChecks(cwd);
  const summary = createDoctorRunSummary(checks, { exitPolicy });
  printLine(
    JSON.stringify(
      {
        checks,
        summary,
      },
      null,
      2,
    ),
  );
  if (summary.exitCode === 1) {
    throw createCliCommandError({
      code: CLI_DIAGNOSTIC_CODES.DOCTOR_CHECK_FAILED,
      command: 'doctor',
      detailLines: getDoctorExitFailureDetailLines(checks, { exitPolicy }),
      summary: 'One or more doctor checks failed.',
    });
  }
}

export async function dispatchPortableCliDoctor({
  cwd,
  mergedFlags,
  printLine,
}: PortableCliDispatchContext): Promise<void> {
  const exitPolicy = mergedFlags['workspace-only'] ? 'workspace-only' : 'strict';
  if (mergedFlags.format === 'json') {
    await renderPortableCliDoctorJson(cwd, exitPolicy, printLine);
    return;
  }
  await executeDoctorCommand(cwd, { exitPolicy });
}
