export const TTSC_LINT_CONFIG_FILENAMES = [
  'lint.config.ts',
  'lint.config.mts',
  'lint.config.cts',
  'lint.config.mjs',
  'lint.config.cjs',
  'lint.config.js',
  'lint.config.json',
  'ttsc-lint.config.ts',
  'ttsc-lint.config.mts',
  'ttsc-lint.config.cts',
  'ttsc-lint.config.mjs',
  'ttsc-lint.config.cjs',
  'ttsc-lint.config.js',
  'ttsc-lint.config.json',
] as const;

export function hasWordPressTtscLintConfigSource(source: string): boolean {
  return (
    /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]@wp-typia\/ttsc-lint-plugin-wp['"]/u.test(
      source,
    ) &&
    /['"]wordpress\/i18n-text-domain['"]\s*:/u.test(source)
  );
}
