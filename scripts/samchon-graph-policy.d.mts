export interface SamchonGraphPolicy {
  readonly approvalMode: string;
  readonly args: readonly string[];
  readonly binaryName: string;
  readonly command: string;
  readonly configFile: string;
  readonly cwd: string;
  readonly languages: readonly string[];
  readonly mode: string;
  readonly packageName: string;
  readonly startupTimeoutSec: number;
  readonly version: string;
}

export const SAMCHON_GRAPH_POLICY: Readonly<SamchonGraphPolicy>;

export function createSamchonGraphCliArgs(
  prefixArgs?: readonly string[],
): string[];
