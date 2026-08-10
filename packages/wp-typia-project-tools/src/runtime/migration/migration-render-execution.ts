import type {
  GeneratedMigrationEntry,
  MigrationEntry,
  MigrationProjectState,
} from './migration-types.js';
import {
  quoteTypeScriptString,
  renderTypeScriptValue,
} from '../shared/ts-string-literals.js';

export function renderVerifyFile(
	state: MigrationProjectState,
	blockKey: string,
	entries: MigrationEntry[],
): string {
  const block = state.blocks.find((entry) => entry.key === blockKey);
  if (!block) {
    throw new Error(`Unknown migration block target: ${blockKey}`);
  }
  if (entries.length === 0) {
    return `/* eslint-disable no-console */
console.log(
  'Run \`wp-typia migrate scaffold --from-migration-version <label>\` before verify.',
);
`;
  }

  const imports = [
    `import { validators } from ${quoteTypeScriptString(entries[0]?.validatorImport ?? './validators')};`,
    "import { deprecated } from './deprecated';",
  ];
  const checks: string[] = [];

  entries.forEach((entry, index) => {
    imports.push(
      `import fixture_${index} from ${quoteTypeScriptString(entry.fixtureImport)} with { type: 'json' };`,
    );
    imports.push(
      `import * as rule_${index} from ${quoteTypeScriptString(entry.ruleImport)};`,
    );
    checks.push(
      `if (selectedMigrationVersions.length === 0 || selectedMigrationVersions.includes(`,
      `  ${quoteTypeScriptString(entry.fromVersion)},`,
      ')) {',
    );
    checks.push(`  if (rule_${index}.unresolved.length > 0) {`);
    checks.push(
      '    throw new Error(',
      `      ${quoteTypeScriptString(`Unresolved migration TODOs remain for ${entry.fromVersion} -> ${entry.toVersion}: `)} +`,
      `        rule_${index}.unresolved.join(', '),`,
      '    );',
    );
    checks.push('  }');
    checks.push(
      `  const cases_${index} = Array.isArray(fixture_${index}.cases) ? fixture_${index}.cases : [];`,
    );
    checks.push(`  for (const fixtureCase of cases_${index}) {`);
    checks.push(
      `    const migrated_${index} = rule_${index}.migrate(fixtureCase.input ?? {});`,
    );
    checks.push(
      `    const validation_${index} = validators.validate(migrated_${index});`,
    );
    checks.push(`    if (!isValidationSuccess(validation_${index})) {`);
    checks.push(
      '      throw new Error(',
      `        ${quoteTypeScriptString(`Current validator rejected migrated fixture for ${entry.fromVersion} case `)} +`,
      `          String(fixtureCase.name ?? 'unknown') +`,
      "          ': ' +",
      `          JSON.stringify(getValidationErrors(validation_${index})),`,
      '      );',
    );
    checks.push('    }');
    checks.push('  }');
    checks.push(
      '  console.log(',
      `    ${quoteTypeScriptString(`Verified ${entry.fromVersion} -> ${entry.toVersion} (`)} +`,
      `      cases_${index}.length +`,
      "      ' case(s))',",
      '  );',
    );
    checks.push('}');
  });

  return `/* eslint-disable no-console */
${imports.join('\n')}

function isValidationSuccess(result: unknown): boolean {
  return (
    result !== null &&
    typeof result === 'object' &&
    ((result as { isValid?: unknown }).isValid === true ||
      (result as { success?: unknown }).success === true)
  );
}

function getValidationErrors(result: unknown): unknown[] {
  if (
    result !== null &&
    typeof result === 'object' &&
    Array.isArray((result as { errors?: unknown[] }).errors)
  ) {
    return (result as { errors: unknown[] }).errors;
  }

  return [];
}

const args = process.argv.slice(2);
const selectedMigrationVersions =
  args[0] === '--all'
    ? []
    : args[0] === '--from-migration-version' && args[1]
      ? [args[1]]
      : [];

if (deprecated.length !== ${entries.length}) {
  throw new Error(
    'Generated deprecated entries are out of sync with migration registry.',
  );
}

${checks.join('\n')}

console.log(${quoteTypeScriptString(`Migration verification passed for ${block.blockName}`)});
`;
}

export function renderFuzzFile(
	state: MigrationProjectState,
	blockKey: string,
	entries: GeneratedMigrationEntry[],
): string {
  const block = state.blocks.find((entry) => entry.key === blockKey);
  if (!block) {
    throw new Error(`Unknown migration block target: ${blockKey}`);
  }
  if (entries.length === 0) {
    return `/* eslint-disable no-console */
console.log(
  'Run \`wp-typia migrate scaffold --from-migration-version <label>\` before fuzz.',
);
`;
  }

  const imports = [
    `import { validators } from ${quoteTypeScriptString(entries[0]?.entry.validatorImport ?? './validators')};`,
  ];
  const edgeDefinitions: string[] = [];

  entries.forEach(({ entry, fuzzPlan }, index) => {
    imports.push(
      `import fixture_${index} from ${quoteTypeScriptString(entry.fixtureImport)} with { type: 'json' };`,
    );
    imports.push(
      `import manifest_${index} from ${quoteTypeScriptString(entry.manifestImport)} with { type: 'json' };`,
    );
    imports.push(
      `import * as rule_${index} from ${quoteTypeScriptString(entry.ruleImport)};`,
    );
    const renderedPlan = renderTypeScriptValue(fuzzPlan);
    edgeDefinitions.push(`  {
    fromMigrationVersion: ${quoteTypeScriptString(entry.fromVersion)},
    toMigrationVersion: ${quoteTypeScriptString(entry.toVersion)},
    fixture: fixture_${index},
    legacyManifest: manifest_${index},
    rule: rule_${index},
    plan: ${renderedPlan.replace(/\n/gu, '\n    ')},
  },`);
  });

  return `/* eslint-disable no-console, no-bitwise */
${imports.join('\n')}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type ManifestAttribute = {
\ttypia?: {
\t\tdefaultValue?: JsonValue | null;
\t\thasDefault?: boolean;
\t};
\tts?: {
\t\titems?: ManifestAttribute | null;
\t\tkind?: string | null;
\t\tproperties?: Record<string, ManifestAttribute> | null;
\t\tunion?: {
\t\t\tbranches?: Record<string, ManifestAttribute> | null;
\t\t\tdiscriminator?: string | null;
\t\t} | null;
\t} | null;
\twp?: {
\t\tdefaultValue?: JsonValue | null;
\t\tenum?: JsonValue[] | null;
\t\thasDefault?: boolean;
\t} | null;
};

type ManifestDocument = {
\tattributes?: Record<string, ManifestAttribute>;
};

type FixtureDocument = {
\tcases?: Array<{ input?: Record<string, unknown>; name?: string }>;
};

type FuzzEdge = {
\tfixture: FixtureDocument;
\tfromMigrationVersion: string;
\tlegacyManifest: ManifestDocument;
\tplan: {
\t\tblockedPaths: string[];
\t\tcompatibleMappings: Array<{ currentPath: string; legacyPath: string }>;
\t};
\trule: {
\t\tmigrate(input: Record<string, unknown>): unknown;
\t};
\ttoMigrationVersion: string;
};

const edges: FuzzEdge[] = [
${edgeDefinitions.join('\n')}
];

function cloneJsonValue<T>(value: T): T {
\treturn JSON.parse(JSON.stringify(value));
}

function toRecord(value: unknown, label: string): Record<string, unknown> {
\tif (value === null || typeof value !== 'object' || Array.isArray(value)) {
\t\tthrow new Error(label + ' must be a JSON object.');
\t}
\treturn value as Record<string, unknown>;
}

function getValueAtPath(input: Record<string, unknown>, pathLabel: string): unknown {
\treturn String(pathLabel)
\t\t.split('.')
\t\t.reduce<unknown>(
\t\t\t(value, segment) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[segment] : undefined),
\t\t\tinput,
\t\t);
}

function setValueAtPath(input: Record<string, unknown>, pathLabel: string, value: unknown): void {
\tconst segments = String(pathLabel).split('.').filter(Boolean);
\tif (segments.length === 0) {
\t\treturn;
\t}

\tlet target: Record<string, unknown> = input;
\twhile (segments.length > 1) {
\t\tconst segment = segments.shift();
\t\tif (!segment) {
\t\t\tcontinue;
\t\t}
\t\tconst nestedValue = target[segment];
\t\tif (nestedValue === null || typeof nestedValue !== 'object' || Array.isArray(
\t\t\tnestedValue,
\t\t)) {
\t\t\tconst nextTarget: Record<string, unknown> = {};
\t\t\ttarget[segment] = nextTarget;
\t\t\ttarget = nextTarget;
\t\t\tcontinue;
\t\t}
\t\ttarget = nestedValue as Record<string, unknown>;
\t}

\ttarget[segments[0]!] = value;
}

function createDefaultValue(attribute: ManifestAttribute): JsonValue | Record<string, JsonValue> | null {
\tif (attribute?.typia?.hasDefault) {
\t\treturn cloneJsonValue(attribute.typia.defaultValue ?? null);
\t}
\tif (attribute?.wp?.hasDefault) {
\t\treturn cloneJsonValue(attribute.wp.defaultValue ?? null);
\t}
\tif (Array.isArray(attribute?.wp?.enum) && attribute.wp.enum.length > 0) {
\t\treturn cloneJsonValue(attribute.wp.enum[0] ?? null);
\t}

\tswitch (attribute?.ts?.kind) {
\t\tcase 'string':
\t\t\treturn '';
\t\tcase 'number':
\t\t\treturn 0;
\t\tcase 'boolean':
\t\t\treturn false;
\t\tcase 'array':
\t\t\treturn [];
\t\tcase 'object':
\t\t\treturn Object.fromEntries(
\t\t\t\tObject.entries(attribute?.ts?.properties ?? {}).map(
\t\t\t\t\t([key, property]) => [key, createDefaultValue(property)],
\t\t\t\t),
\t\t\t);
\t\tcase 'union': {
\t\t\tconst firstBranch = Object.values(
\t\t\t\tattribute?.ts?.union?.branches ?? {},
\t\t\t)[0];
\t\t\treturn firstBranch ? createDefaultValue(firstBranch) : null;
\t\t}
\t\tdefault:
\t\t\treturn null;
\t}
}

function createDefaultInput(manifest: ManifestDocument): Record<string, unknown> {
\treturn Object.fromEntries(
\t\tObject.entries(manifest?.attributes ?? {}).map(([key, attribute]) => [
\t\t\tkey,
\t\t\tcreateDefaultValue(attribute),
\t\t]),
\t);
}

function isValidationSuccess(result: unknown): boolean {
\tconst typedResult =
\t\tresult !== null && typeof result === 'object'
\t\t\t? (result as { isValid?: unknown; success?: unknown })
\t\t\t: null;

\treturn (
\t\ttypedResult !== null &&
\t\t(
\t\t\ttypedResult.isValid === true ||
\t\t\ttypedResult.success === true
\t\t)
\t);
}

function getValidationErrors(result: unknown): unknown[] {
\tif (
\t\tresult !== null &&
\t\ttypeof result === 'object' &&
\t\tArray.isArray((result as { errors?: unknown[] }).errors)
\t) {
\t\treturn (result as { errors: unknown[] }).errors;
\t}

\treturn [];
}

function createSeededRandom(seed: number): () => number {
\tlet state = seed >>> 0;
\treturn () => {
\t\tstate = (state * 1664525 + 1013904223) >>> 0;
\t\treturn state / 4294967296;
\t};
}

function withSeededRandom<T>(seed: number, callback: () => T): T {
\tconst originalRandom = Math.random;
\tMath.random = createSeededRandom(seed);
\ttry {
\t\treturn callback();
\t} finally {
\t\tMath.random = originalRandom;
\t}
}

function parseArgs(argv: string[]): {
\tall: boolean;
\tfromMigrationVersion?: string;
\titerations: number;
\tseed?: number;
} {
\tlet all = false;
\tlet fromMigrationVersion: string | undefined;
\tlet iterations = 25;
\tlet seed: number | undefined;

\tfor (let index = 0; index < argv.length; index += 1) {
\t\tconst arg = argv[index];
\t\tconst next = argv[index + 1];

\t\tif (arg === '--all') {
\t\t\tall = true;
\t\t\tcontinue;
\t\t}
\t\tif (arg === '--from-migration-version') {
\t\t\tfromMigrationVersion = next;
\t\t\tindex += 1;
\t\t\tcontinue;
\t\t}
\t\tif (arg === '--iterations') {
\t\t\titerations = Number.parseInt(next ?? '', 10) || 25;
\t\t\tindex += 1;
\t\t\tcontinue;
\t\t}
\t\tif (arg === '--seed') {
\t\t\tseed = Number.parseInt(next ?? '', 10);
\t\t\tindex += 1;
\t\t}
\t}

\treturn { all, fromMigrationVersion, iterations, seed };
}

function applyCompatibleMappings(
\tbaseInput: Record<string, unknown>,
\tcurrentSample: Record<string, unknown>,
\tmappings: Array<{ currentPath: string; legacyPath: string }>,
): Record<string, unknown> {
\tfor (const mapping of mappings) {
\t\tconst value = getValueAtPath(currentSample, mapping.currentPath);
\t\tif (value !== undefined) {
\t\t\tsetValueAtPath(baseInput, mapping.legacyPath, cloneJsonValue(value));
\t\t}
\t}
\treturn baseInput;
}

function assertValidMigration(
\tedge: FuzzEdge,
\tcandidateInput: Record<string, unknown>,
\tmigratedOutput: unknown,
\tvalidation: unknown,
\titerationSeed: number,
\titeration: number | string,
): void {
\tif (isValidationSuccess(validation)) {
\t\treturn;
\t}

\tthrow new Error(
\t\t'Migration fuzz failed for ' +
\t\t\tedge.fromMigrationVersion +
\t\t\t' -> ' +
\t\t\tedge.toMigrationVersion +
\t\t\t' (seed ' +
\t\t\tString(iterationSeed) +
\t\t\t', iteration ' +
\t\t\tString(iteration) +
\t\t\t'): ' +
\t\t\tJSON.stringify({
\t\t\t\tinput: candidateInput,
\t\t\t\tmigrated: migratedOutput,
\t\t\t\terrors: getValidationErrors(validation),
\t\t\t}),
\t\t);
}

const parsed = parseArgs(process.argv.slice(2));
const selectedMigrationVersions = parsed.all
\t? []
\t: parsed.fromMigrationVersion
\t\t? [parsed.fromMigrationVersion]
\t\t: edges.map((edge) => edge.fromMigrationVersion);
const baseSeed = typeof parsed.seed === 'number' ? parsed.seed : Date.now();

if (!Number.isInteger(parsed.seed)) {
\tconsole.log('Using migration fuzz seed ' + String(baseSeed));
}

if (edges.length === 0) {
\tconsole.log('No legacy migration versions configured for migration fuzzing.');
\tprocess.exit(0);
}

let executedEdges = 0;

for (const [edgeIndex, edge] of edges.entries()) {
\tif (selectedMigrationVersions.length > 0 && !selectedMigrationVersions.includes(
\t\tedge.fromMigrationVersion,
\t)) {
\t\tcontinue;
\t}

\texecutedEdges += 1;

\tconst fixtureCases = Array.isArray(edge.fixture?.cases)
\t\t? edge.fixture.cases
\t\t: [];
\tfor (const fixtureCase of fixtureCases) {
\t\tconst migrated = edge.rule.migrate(fixtureCase.input ?? {});
\t\tconst validation = validators.validate(migrated);
\t\tassertValidMigration(
\t\t\tedge,
\t\t\tfixtureCase.input ?? {},
\t\t\tmigrated,
\t\t\tvalidation,
\t\t\tbaseSeed,
\t\t\tfixtureCase.name ?? 'fixture',
\t\t);
\t}

\tfor (let iteration = 0; iteration < parsed.iterations; iteration += 1) {
\t\tconst iterationSeed = (baseSeed + edgeIndex * 100003 + iteration) >>> 0;
\t\tconst currentSample = toRecord(
\t\t\twithSeededRandom(iterationSeed, () => validators.random()),
\t\t\t'Current validator random sample',
\t\t);
\t\tconst baseFixture = fixtureCases.find(
\t\t\t(fixtureCase) => fixtureCase.name === 'default',
\t\t)?.input;
\t\tconst legacyInput = applyCompatibleMappings(
\t\t\tcloneJsonValue(baseFixture ?? createDefaultInput(edge.legacyManifest)),
\t\t\tcurrentSample,
\t\t\tedge.plan.compatibleMappings,
\t\t);
\t\tconst migrated = edge.rule.migrate(legacyInput);
\t\tconst validation = validators.validate(migrated);
\t\tassertValidMigration(
\t\t\tedge,
\t\t\tlegacyInput,
\t\t\tmigrated,
\t\t\tvalidation,
\t\t\titerationSeed,
\t\t\titeration,
\t\t);
\t}

\tconsole.log(
\t\t'Fuzzed ' +
\t\t\tedge.fromMigrationVersion +
\t\t\t' -> ' +
\t\t\tedge.toMigrationVersion +
\t\t\t' (' +
\t\t\tString(fixtureCases.length) +
\t\t\t' fixture case(s), ' +
\t\t\tString(parsed.iterations) +
\t\t\t' fuzz iteration(s))',
\t);
}

if (selectedMigrationVersions.length > 0 && executedEdges === 0) {
\tthrow new Error(
\t\t'Requested migration version was not exercised by fuzz: ' +
\t\t\tselectedMigrationVersions.join(', '),
\t);
}

console.log(${quoteTypeScriptString(`Migration fuzzing passed for ${block.blockName}`)});
`.replace(/\t/gu, '  ');
}
