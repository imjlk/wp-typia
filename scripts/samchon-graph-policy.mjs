export const SAMCHON_GRAPH_POLICY = Object.freeze({
  approvalMode: 'approve',
  args: Object.freeze(['scripts/run-samchon-graph.mjs']),
  binaryName: 'samchon-graph',
  command: 'node',
  configFile: '.codex/config.toml',
  cwd: '..',
  languages: Object.freeze(['typescript', 'php']),
  mode: 'static',
  packageName: '@samchon/graph',
  version: '0.1.0',
});

export function createSamchonGraphCliArgs(prefixArgs = []) {
  return [
    ...prefixArgs,
    '--mode',
    SAMCHON_GRAPH_POLICY.mode,
    ...SAMCHON_GRAPH_POLICY.languages.flatMap((language) => [
      '--language',
      language,
    ]),
  ];
}
