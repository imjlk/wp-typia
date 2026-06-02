import packageJson from '../../package.json';
import type { PrintLine } from '../print-line';

export function renderPortableCliVersion(
  printLine: PrintLine,
  options: {
    format?: string;
  } = {},
) {
  if (options.format === 'json') {
    printLine(
      JSON.stringify(
        {
          ok: true,
          data: {
            type: 'version',
            name: packageJson.name,
            version: packageJson.version,
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  printLine(`wp-typia ${packageJson.version}`);
}
