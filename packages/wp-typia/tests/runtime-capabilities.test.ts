import { describe, expect, test } from 'bun:test';

import { isInteractiveTerminal } from '../src/runtime-capabilities';

describe('wp-typia runtime capability detection', () => {
	test('interactive terminals require TTY stdin/stdout and a non-dumb TERM', () => {
		expect(
			isInteractiveTerminal({
				stdin: { isTTY: true },
				stdout: { isTTY: true },
				term: 'xterm-256color',
			}),
		).toBe(true);
		expect(
			isInteractiveTerminal({
				stdin: { isTTY: false },
				stdout: { isTTY: true },
				term: 'xterm-256color',
			}),
		).toBe(false);
		expect(
			isInteractiveTerminal({
				stdin: { isTTY: true },
				stdout: { isTTY: false },
				term: 'xterm-256color',
			}),
		).toBe(false);
		expect(
			isInteractiveTerminal({
				stdin: { isTTY: true },
				stdout: { isTTY: true },
				term: 'dumb',
			}),
		).toBe(false);
	});

	test('default runtime capability arguments mirror the current process streams', () => {
		expect(isInteractiveTerminal()).toBe(
			isInteractiveTerminal({
				stdin: process.stdin,
				stdout: process.stdout,
				term: process.env.TERM,
			}),
		);
	});
});
