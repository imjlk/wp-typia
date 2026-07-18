export interface SamchonGraphValidationResult {
  errors: string[];
  valid: boolean;
}

export const SAMCHON_GRAPH_POLICY: Readonly<{
  approvalMode: 'approve';
  args: readonly [
    '-c',
    'repo_root=$(git rev-parse --show-toplevel) && cd "$repo_root" && exec "$repo_root/node_modules/.bin/samchon-graph" --mode static --language typescript --language php',
  ];
  command: 'sh';
  configFile: '.codex/config.toml';
  languages: readonly ['typescript', 'php'];
  packageName: '@samchon/graph';
  version: '0.1.0';
}>;

export function validateSamchonGraphConfig(
  repoRoot?: string,
): SamchonGraphValidationResult;
