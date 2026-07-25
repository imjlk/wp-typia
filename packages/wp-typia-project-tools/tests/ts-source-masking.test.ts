import { describe, expect, test } from 'bun:test';

import {
  findExecutablePatternMatch,
  hasExecutablePattern,
  hasUncommentedPattern,
  maskTypeScriptComments,
  maskTypeScriptCommentsAndLiterals,
} from '../src/runtime/ts-source-masking.js';

describe('TypeScript source masking', () => {
	test('masks comments while preserving offsets and newlines', () => {
		const source = [
			'const before = true;',
			'// registerWorkspaceVariations();',
			'const after = true; /* applyWorkspaceBlockTransforms(registration.settings); */',
		].join('\n');

		const masked = maskTypeScriptComments(source);

		expect(masked).toHaveLength(source.length);
		expect(masked.split('\n')).toHaveLength(source.split('\n').length);
		expect(masked).toContain('const before = true;');
		expect(masked).toContain('const after = true;');
		expect(masked).not.toContain('registerWorkspaceVariations');
		expect(masked).not.toContain('applyWorkspaceBlockTransforms');
	});

	test('distinguishes uncommented imports from commented imports', () => {
		const importPattern =
			/^\s*import\s*\{\s*registerWorkspaceVariations\s*\}\s*from\s*["']\.\/variations["']\s*;?\s*$/mu;
		const commentedSource = [
			"// import { registerWorkspaceVariations } from './variations';",
			'const marker = true;',
		].join('\n');
		const activeSource = [
			"import { registerWorkspaceVariations } from './variations';",
			'const marker = true;',
		].join('\n');

		expect(hasUncommentedPattern(commentedSource, importPattern)).toBe(false);
		expect(hasUncommentedPattern(activeSource, importPattern)).toBe(true);
	});

	test('ignores string and template literal text for executable pattern checks', () => {
		const callPattern = /registerWorkspaceBlockStyles\s*\(\s*\)\s*;?/u;
		const source = [
			"const stringText = 'registerWorkspaceBlockStyles();';",
			'const doubleQuoted = "registerWorkspaceBlockStyles();";',
			'const templateText = `registerWorkspaceBlockStyles();`; ',
			'// registerWorkspaceBlockStyles();',
		].join('\n');

		expect(hasExecutablePattern(source, callPattern)).toBe(false);
	});

	test('detects executable source patterns after masking non-executable text', () => {
		const callPattern = /registerWorkspaceBlockStyles\s*\(\s*\)\s*;?/u;
		const source = [
			"const stringText = 'registerWorkspaceBlockStyles();';",
			'registerWorkspaceBlockStyles();',
		].join('\n');

		expect(hasExecutablePattern(source, callPattern)).toBe(true);
		expect(findExecutablePatternMatch(source, [callPattern])).toEqual({
			end: source.length,
			start: source.lastIndexOf('registerWorkspaceBlockStyles();'),
		});
	});

	test('masks escaped quotes inside literals without losing following executable source', () => {
		const callPattern = /applyWorkspaceBlockTransforms\s*\(\s*registration\s*\.\s*settings\s*\)\s*;?/u;
		const source = [
			`const quoted = "ignore \\"applyWorkspaceBlockTransforms(registration.settings);\\"";`,
			'applyWorkspaceBlockTransforms(registration.settings);',
		].join('\n');

		const masked = maskTypeScriptCommentsAndLiterals(source);

		expect(masked).toHaveLength(source.length);
		expect(hasExecutablePattern(source, callPattern)).toBe(true);
		expect(findExecutablePatternMatch(source, [callPattern])?.start).toBe(
			source.lastIndexOf('applyWorkspaceBlockTransforms'),
		);
	});
});
