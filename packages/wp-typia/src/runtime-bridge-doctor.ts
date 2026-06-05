import type { DoctorExitPolicy } from '@wp-typia/project-tools/cli-doctor';
import { wrapCliCommandError } from './runtime-bridge-shared';

const loadCliDoctorRuntime = () => import('@wp-typia/project-tools/cli-doctor');

type ExecuteDoctorCommandOptions = {
  exitPolicy?: DoctorExitPolicy;
  wordpressVersionCheck?: boolean;
};

export async function executeDoctorCommand(
  cwd: string,
  options: ExecuteDoctorCommandOptions = {},
): Promise<void> {
  try {
    const { runDoctor } = await loadCliDoctorRuntime();
    await runDoctor(cwd, {
      exitPolicy: options.exitPolicy,
      wordpressVersionCheck: options.wordpressVersionCheck,
    });
  } catch (error) {
    throw await wrapCliCommandError('doctor', error);
  }
}
