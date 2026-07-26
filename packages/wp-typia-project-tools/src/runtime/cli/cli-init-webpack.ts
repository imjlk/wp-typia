import fs from 'node:fs';
import path from 'node:path';

const LEGACY_TYPIA_WEBPACK_SPECIFIER = '@typia/unplugin/webpack';
const TTSC_WEBPACK_SPECIFIER = '@ttsc/unplugin/webpack';
const WEBPACK_CONFIG_CANDIDATES = [
  'webpack.config.cjs',
  'webpack.config.js',
  'webpack.config.mjs',
  'webpack.config.ts',
] as const;

export interface RetrofitWebpackChange {
  path: string;
  source: string;
}

export function collectRetrofitWebpackChanges(
	projectDir: string,
): RetrofitWebpackChange[] {
  return WEBPACK_CONFIG_CANDIDATES.flatMap((relativePath) => {
    const filePath = path.join(projectDir, relativePath);
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const source = fs.readFileSync(filePath, 'utf8');
    if (!source.includes(LEGACY_TYPIA_WEBPACK_SPECIFIER)) {
      return [];
    }

    return [
      {
        path: relativePath,
        source: source
          .split(LEGACY_TYPIA_WEBPACK_SPECIFIER)
          .join(TTSC_WEBPACK_SPECIFIER),
      },
    ];
  });
}
