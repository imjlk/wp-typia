import { execFileSync } from 'node:child_process';

export function runUtf8Command(
	command: string,
	args: string[],
	options: Parameters<typeof execFileSync>[2] = {},
): string {
  return execFileSync(command, args, {
    ...options,
    encoding: 'utf8',
  });
}
