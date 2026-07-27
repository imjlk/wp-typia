import {
  CLI_DIAGNOSTIC_CODES,
  createCliDiagnosticCodeError,
} from '@wp-typia/project-tools/cli-diagnostics';

export const STANDALONE_TARGETS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'windows-x64',
] as const;

export type StandaloneTarget = (typeof STANDALONE_TARGETS)[number];

export const STANDALONE_MANIFEST_FILENAME = 'standalone-manifest.env';
export const STANDALONE_CHECKSUMS_FILENAME = 'SHA256SUMS';
export const STANDALONE_RELEASE_REPOSITORY = 'imjlk/wp-typia';

const STANDALONE_TARGET_SET = new Set<string>(STANDALONE_TARGETS);

export function isStandaloneTarget(value: string): value is StandaloneTarget {
  return STANDALONE_TARGET_SET.has(value);
}

export function detectNativeStandaloneTarget(
	platform = process.platform,
	arch = process.arch,
): StandaloneTarget {
  if (platform === 'darwin') {
    if (arch === 'arm64') {
      return 'darwin-arm64';
    }

    if (arch === 'x64') {
      return 'darwin-x64';
    }
  }

  if (platform === 'linux') {
    if (arch === 'arm64') {
      return 'linux-arm64';
    }

    if (arch === 'x64') {
      return 'linux-x64';
    }
  }

  if (platform === 'win32' && arch === 'x64') {
    return 'windows-x64';
  }

  throw createCliDiagnosticCodeError(
    CLI_DIAGNOSTIC_CODES.UNSUPPORTED_COMMAND,
    `Unsupported native standalone target for ${platform}/${arch}. Supported standalone targets: ${STANDALONE_TARGETS.join(', ')}`,
  );
}

export function parseStandaloneTargets(
	input?: string,
	options: {
		arch?: NodeJS.Architecture;
		platform?: NodeJS.Platform;
	} = {},
): StandaloneTarget[] {
  const trimmed = input?.trim();

  if (!trimmed || trimmed === 'native') {
    return [detectNativeStandaloneTarget(options.platform, options.arch)];
  }

  if (trimmed === 'all') {
    return [...STANDALONE_TARGETS];
  }

  const resolvedTargets: StandaloneTarget[] = [];
  for (const candidate of trimmed
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean)) {
    if (candidate === 'native') {
      const nativeTarget = detectNativeStandaloneTarget(
        options.platform,
        options.arch,
      );
      if (!resolvedTargets.includes(nativeTarget)) {
        resolvedTargets.push(nativeTarget);
      }
      continue;
    }

    if (!isStandaloneTarget(candidate)) {
      throw createCliDiagnosticCodeError(
        CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
        `Unsupported standalone target "${candidate}". Expected one of: native, all, ${STANDALONE_TARGETS.join(', ')}`,
      );
    }

    if (!resolvedTargets.includes(candidate)) {
      resolvedTargets.push(candidate);
    }
  }

  if (resolvedTargets.length === 0) {
    throw createCliDiagnosticCodeError(
      CLI_DIAGNOSTIC_CODES.INVALID_ARGUMENT,
      'At least one standalone target is required. Use `native`, `all`, or a comma-separated list of supported targets.',
    );
  }

  return resolvedTargets;
}

export function getStandaloneBinaryFilename(
	packageName: string,
	target: StandaloneTarget,
): string {
  return target === 'windows-x64' ? `${packageName}.exe` : packageName;
}

export function getStandaloneArchiveFilename(
	packageName: string,
	version: string,
	target: StandaloneTarget,
): string {
  const assetBaseName = `${packageName}-${version}-${target}`;
  return target === 'windows-x64'
    ? `${assetBaseName}.zip`
    : `${assetBaseName}.tar.gz`;
}

export function getStandaloneManifestKey(target: StandaloneTarget): string {
  return target.replace(/-/gu, '_');
}

export function getStandaloneCompileTarget(
	target: StandaloneTarget,
): Bun.Build.CompileTarget {
  return `bun-${target}` as Bun.Build.CompileTarget;
}
