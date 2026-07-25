export interface GutenbergUpstreamWatchItem {
  number: number;
  state: string;
  title: string;
  updatedAt: string;
  url: string;
}

export interface GutenbergUpstreamWatchAreaActivity {
  id: string;
  issues: GutenbergUpstreamWatchItem[];
  pullRequests: GutenbergUpstreamWatchItem[];
  title: string;
}

export interface GutenbergUpstreamWatchPackageVersion {
  name: string;
  path: string;
  version: string;
}

export interface GutenbergUpstreamWatchPin {
  path: string;
  spec: string;
}

export interface GutenbergUpstreamWatchPinsSummary {
  allAligned: boolean;
  uniqueSpecs: string[];
}

export interface GutenbergUpstreamWatchReport {
  areaActivity: GutenbergUpstreamWatchAreaActivity[];
  blocksVersionDrift: ReturnType<typeof evaluateBlocksVersionDrift>;
  cadence: string;
  generatedAt: string;
  issueNumber: number;
  localBlockEditorPins: GutenbergUpstreamWatchPin[];
  localBlockEditorPinsSummary: GutenbergUpstreamWatchPinsSummary;
  localBlocksBaseline: {
    owner: string;
    spec: string;
  };
  localBlocksPins: GutenbergUpstreamWatchPin[];
  localBlocksPinsSummary: GutenbergUpstreamWatchPinsSummary;
  lookbackDays: number;
  reportMarker: string;
  sinceDate: string;
  upstreamPackageVersions: GutenbergUpstreamWatchPackageVersion[];
}

export declare const GUTENBERG_UPSTREAM_WATCH_POLICY: Readonly<{
  cadence: 'weekly';
  defaultLookbackDays: number;
  defaultMaxResultsPerQuery: number;
  issueNumber: 283;
  upstream: Readonly<{
    owner: 'WordPress';
    repo: 'gutenberg';
    ref: 'trunk';
  }>;
  trackedPackagePaths: Readonly<Record<string, string>>;
  localTemplatePinFiles: readonly string[];
  areas: readonly Readonly<{
    id: string;
    issueTerms: readonly string[];
    title: string;
  }>[];
  workflowFile: '.github/workflows/gutenberg-upstream-watch.yml';
}>;

export declare function parseArgs(argv: string[]): {
  jsonFile: string | null;
  lookbackDays: number;
  maxResultsPerQuery: number;
  reportFile: string | null;
};

export declare function buildSearchQuery(
	area: {
		issueTerms: readonly string[];
	},
	itemType: string,
	sinceDate: string,
): string;

export declare function extractDependencySpec(
	sourceText: string,
	packageName: string,
): string | null;

export declare function collectLocalDependencyPins(
	repoRoot: string,
	packageName: string,
	relativePaths: readonly string[],
): Array<{
  path: string;
  spec: string;
}>;

export declare function evaluateBlocksVersionDrift(
	localSpec: string,
	upstreamVersion: string,
): {
  expectedSpec: string;
  hasDrift: boolean;
  localSpec: string;
  upstreamVersion: string;
};

export declare function renderWatchReport(report: {
  areaActivity: GutenbergUpstreamWatchAreaActivity[];
  blocksVersionDrift: ReturnType<typeof evaluateBlocksVersionDrift>;
  cadence: string;
  generatedAt: string;
  issueNumber: number;
  localBlockEditorPinsSummary: {
    allAligned: boolean;
    uniqueSpecs: string[];
  };
  localBlocksBaseline: {
    owner: string;
    spec: string;
  };
  localBlocksPinsSummary: {
    allAligned: boolean;
    uniqueSpecs: string[];
  };
  lookbackDays: number;
  sinceDate: string;
  upstreamPackageVersions: Array<{
    name: string;
    path: string;
    version: string;
  }>;
}): string;

export declare function generateGutenbergUpstreamWatchReport(options?: {
  lookbackDays?: number;
  maxResultsPerQuery?: number;
  now?: Date;
  repoRoot?: string;
  token?: string | null;
}): Promise<{
  markdown: string;
  report: GutenbergUpstreamWatchReport;
}>;

export declare function runCli(options?: {
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdout?: { write(chunk: string): unknown };
  stderr?: { write(chunk: string): unknown };
}): Promise<0 | 1>;
