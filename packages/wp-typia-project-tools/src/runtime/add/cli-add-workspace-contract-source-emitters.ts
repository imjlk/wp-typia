import {
	quoteTsString,
} from './cli-add-shared.js';
import { toTitleCase } from '../shared/string-case.js';

/**
 * Render one `CONTRACTS` inventory entry for `scripts/block-config.ts`.
 *
 * @param contractSlug Stable kebab-case contract id.
 * @param sourceTypeName Exported TypeScript type/interface used for schema generation.
 */
export function buildContractConfigEntry(
	contractSlug: string,
	sourceTypeName: string,
): string {
  return [
		'\t{',
		`\t\tschemaFile: ${quoteTsString(`src/contracts/${contractSlug}.schema.json`)},`,
		`\t\tslug: ${quoteTsString(contractSlug)},`,
		`\t\tsourceTypeName: ${quoteTsString(sourceTypeName)},`,
		`\t\ttypesFile: ${quoteTsString(`src/contracts/${contractSlug}.ts`)},`,
		'\t},',
	].join('\n');
}

/**
 * Render a small starter TypeScript contract that users can replace with their
 * real external route, smoke-test, or PHP integration payload shape.
 *
 * @param contractSlug Stable kebab-case contract id.
 * @param sourceTypeName Exported TypeScript type/interface used for schema generation.
 */
export function buildContractTypesSource(
	contractSlug: string,
	sourceTypeName: string,
): string {
  const title = toTitleCase(contractSlug);

  return `/**
 * ${title} is a standalone wire contract.
 *
 * It does not register a WordPress REST route. Edit this type, then run
 * \`wp-typia sync-rest\` or \`wp-typia sync\` to refresh the JSON Schema
 * artifact referenced from scripts/block-config.ts.
 */
export interface ${sourceTypeName} {
  id: string;
  status: 'pending' | 'ready';
  updatedAt: string;
  message?: string;
}
`;
}
