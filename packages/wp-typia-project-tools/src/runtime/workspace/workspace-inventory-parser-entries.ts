import ts from "typescript";

import { getPropertyNameText } from "../shared/ts-property-names.js";
import {
	assertParsedInventoryEntry,
	type InventoryEntryFieldValue,
	type InventoryEntryParserDescriptor,
	type InventorySectionDescriptor,
} from "./workspace-inventory-parser-validation.js";

function findExportedArrayLiteral(
	sourceFile: ts.SourceFile,
	exportName: string,
): {
	array: ts.ArrayLiteralExpression | null;
	found: boolean;
} {
	for (const statement of sourceFile.statements) {
		if (!ts.isVariableStatement(statement)) {
			continue;
		}
		if (
			!statement.modifiers?.some(
				(modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
			)
		) {
			continue;
		}

		for (const declaration of statement.declarationList.declarations) {
			if (
				!ts.isIdentifier(declaration.name) ||
				declaration.name.text !== exportName
			) {
				continue;
			}
			if (
				declaration.initializer &&
				ts.isArrayLiteralExpression(declaration.initializer)
			) {
				return {
					array: declaration.initializer,
					found: true,
				};
			}
			return {
				array: null,
				found: true,
			};
		}
	}

	return {
		array: null,
		found: false,
	};
}

function getOptionalStringProperty(
	entryName: string,
	elementIndex: number,
	objectLiteral: ts.ObjectLiteralExpression,
	key: string,
): string | undefined {
	for (const property of objectLiteral.properties) {
		if (!ts.isPropertyAssignment(property)) {
			continue;
		}
		const propertyName = getPropertyNameText(property.name);
		if (propertyName !== key) {
			continue;
		}
		if (ts.isStringLiteralLike(property.initializer)) {
			return property.initializer.text;
		}
		throw new Error(
			`${entryName}[${elementIndex}] must use a string literal for "${key}" in scripts/block-config.ts.`,
		);
	}

	return undefined;
}

function getOptionalStringArrayProperty(
	entryName: string,
	elementIndex: number,
	objectLiteral: ts.ObjectLiteralExpression,
	key: string,
): string[] | undefined {
	for (const property of objectLiteral.properties) {
		if (!ts.isPropertyAssignment(property)) {
			continue;
		}
		const propertyName = getPropertyNameText(property.name);
		if (propertyName !== key) {
			continue;
		}
		if (!ts.isArrayLiteralExpression(property.initializer)) {
			throw new Error(
				`${entryName}[${elementIndex}] must use an array literal for "${key}" in scripts/block-config.ts.`,
			);
		}

		return property.initializer.elements.map((element, itemIndex) => {
			if (!ts.isStringLiteralLike(element)) {
				throw new Error(
					`${entryName}[${elementIndex}].${key}[${itemIndex}] must use a string literal in scripts/block-config.ts.`,
				);
			}
			return element.text;
		});
	}

	return undefined;
}

function getOptionalBooleanProperty(
	entryName: string,
	elementIndex: number,
	objectLiteral: ts.ObjectLiteralExpression,
	key: string,
): boolean | undefined {
	for (const property of objectLiteral.properties) {
		if (!ts.isPropertyAssignment(property)) {
			continue;
		}
		const propertyName = getPropertyNameText(property.name);
		if (propertyName !== key) {
			continue;
		}
		if (property.initializer.kind === ts.SyntaxKind.TrueKeyword) {
			return true;
		}
		if (property.initializer.kind === ts.SyntaxKind.FalseKeyword) {
			return false;
		}
		throw new Error(
			`${entryName}[${elementIndex}] must use a boolean literal for "${key}" in scripts/block-config.ts.`,
		);
	}

	return undefined;
}

function parseInventoryEntries<T extends object>(
	arrayLiteral: ts.ArrayLiteralExpression,
	descriptor: InventoryEntryParserDescriptor,
): T[] {
	return arrayLiteral.elements.map((element, elementIndex) => {
		if (!ts.isObjectLiteralExpression(element)) {
			throw new Error(
				`${descriptor.entryName}[${elementIndex}] must be an object literal in scripts/block-config.ts.`,
			);
		}

		const entry: Record<string, InventoryEntryFieldValue> = {};
		for (const field of descriptor.fields) {
			const kind = field.kind ?? "string";
			const value =
				kind === "stringArray"
					? getOptionalStringArrayProperty(
							descriptor.entryName,
							elementIndex,
							element,
							field.key,
						)
					: kind === "boolean"
						? getOptionalBooleanProperty(
								descriptor.entryName,
								elementIndex,
								element,
								field.key,
							)
						: getOptionalStringProperty(
								descriptor.entryName,
								elementIndex,
								element,
								field.key,
							);

			field.validate?.(value, {
				elementIndex,
				entryName: descriptor.entryName,
				key: field.key,
			});
			entry[field.key] = value;
		}

		assertParsedInventoryEntry<T>(entry, descriptor, elementIndex);
		return entry;
	});
}

/**
 * Parse one descriptor-backed inventory section from a TypeScript source file.
 *
 * The generic `T` is the typed entry shape returned in `entries`. The
 * `descriptor` supplies the exported array name, parser field metadata, and
 * whether the section is required; this helper uses `findExportedArrayLiteral`
 * and `parseInventoryEntries` to guarantee object-literal entries and literal
 * field values. It returns parsed entries plus a `found` flag, and throws when
 * required exports are missing, descriptors cannot resolve an export name, or
 * exported values are not array literals.
 */
export function parseInventorySection<T extends object>(
	sourceFile: ts.SourceFile,
	descriptor: InventorySectionDescriptor,
): {
	entries: T[];
	found: boolean;
} {
	if (!descriptor.parse) {
		return {
			entries: [],
			found: false,
		};
	}

	const exportName = descriptor.parse.exportName ?? descriptor.value?.name;
	if (!exportName) {
		throw new Error("Inventory parser descriptor is missing an export name.");
	}

	const exportedArray = findExportedArrayLiteral(sourceFile, exportName);
	if (!exportedArray.found) {
		if (descriptor.parse.required) {
			throw new Error(
				`scripts/block-config.ts must export a ${exportName} array.`,
			);
		}
		return {
			entries: [],
			found: false,
		};
	}
	if (!exportedArray.array) {
		if (descriptor.parse.required) {
			throw new Error(
				`scripts/block-config.ts must export a ${exportName} array.`,
			);
		}
		throw new Error(
			`scripts/block-config.ts must export ${exportName} as an array literal.`,
		);
	}

	return {
		entries: parseInventoryEntries<T>(
			exportedArray.array,
			descriptor.parse.entry,
		),
		found: true,
	};
}
