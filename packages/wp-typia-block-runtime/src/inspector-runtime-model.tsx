import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from "react";

import {
	createEditorModel,
	type EditorFieldOption,
	type EditorModelOptions,
	type ManifestDocument,
} from "./editor.js";
import {
	collectPersistentBlockIdentityRepairs,
	generateScopedClientId,
} from "./identifiers.js";
import { isPlainObject as isRecord } from "./object-utils.js";
import {
	type ValidationResult,
	createAttributeUpdater,
	createNestedAttributeUpdater,
} from "./validation.js";

import type {
	EditorFieldDescriptor,
	InspectorSelectOption,
	PersistentBlockIdentityNode,
	PersistentBlockIdentityRepair,
	UsePersistentBlockIdentityOptions,
	UsePersistentBlockIdentityResult,
	StableEditorModelOptions,
	TypedAttributeUpdater,
	UseEditorFieldsResult,
} from "./inspector-runtime-types.js";

type UnknownRecord = Record<string, unknown>;
const persistentBlockIdentityRepairCache = new WeakMap<
	readonly PersistentBlockIdentityNode[],
	Map<string, Map<string, PersistentBlockIdentityRepair>>
>();

function getPathSegments(path: string): string[] {
	return path.split(".").filter(Boolean);
}

function getDefaultValue(
	field: EditorFieldDescriptor | undefined,
	fallback: unknown,
): unknown {
	if (field?.hasDefault) {
		return field.defaultValue;
	}

	return fallback;
}

function getValueAtPath(source: object, path: string): unknown {
	return getPathSegments(path).reduce<unknown>((current, segment) => {
		if (!isRecord(current)) {
			return undefined;
		}

		return current[segment];
	}, source as UnknownRecord);
}

export function toStringValue(value: unknown, fallback: string): string {
	return typeof value === "string" ? value : fallback;
}

export function toNumberValue(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function toBooleanValue(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

export function toSelectOptions(
	options: readonly EditorFieldOption[],
	labelMap?: Record<string, string>,
): InspectorSelectOption[] {
	return options.map((option) => ({
		label: labelMap?.[String(option.value)] ?? option.label,
		value: String(option.value),
	}));
}

function createValidationResult<T extends object>(value: T): ValidationResult<T> {
	return {
		data: value,
		errors: [],
		isValid: true,
	};
}

function getPersistentBlockIdentityValue(
	value: unknown,
): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? trimmedValue : null;
}

function createPersistentIdAttributePatch<T extends object>(
	attributeName: string,
	value: string,
): Partial<T> {
	return {
		[attributeName]: value,
	} as Partial<T>;
}

function getPersistentBlockIdentityRepairMap(
	blocks: readonly PersistentBlockIdentityNode[],
	options: {
		attributeName: string;
		blockName?: string;
		duplicateDetection?: boolean;
		prefix: string;
	},
): Map<string, PersistentBlockIdentityRepair> {
	const duplicateMode = options.duplicateDetection === false ? "off" : "on";
	const blockScope = options.blockName ?? "*";
	const cacheKey = `${options.attributeName}:${options.prefix}:${duplicateMode}:${blockScope}`;
	let repairMapsByKey = persistentBlockIdentityRepairCache.get(blocks);
	if (!repairMapsByKey) {
		repairMapsByKey = new Map();
		persistentBlockIdentityRepairCache.set(blocks, repairMapsByKey);
	}

	const cachedRepairMap = repairMapsByKey.get(cacheKey);
	if (cachedRepairMap) {
		return cachedRepairMap;
	}

	const nextRepairMap = new Map(
		collectPersistentBlockIdentityRepairs(blocks, options).map((repair) => [
			repair.clientId,
			repair,
		]),
	);
	repairMapsByKey.set(cacheKey, nextRepairMap);
	return nextRepairMap;
}

export function getFieldValue(
	field: EditorFieldDescriptor,
	source: object,
): unknown {
	const currentValue = getValueAtPath(source, field.path);

	if (currentValue !== undefined) {
		return currentValue;
	}

	switch (field.control) {
		case "toggle":
			return getDefaultValue(field, false);
		case "number":
		case "range":
			return getDefaultValue(field, 0);
		case "select":
		case "text":
		case "textarea":
			return getDefaultValue(field, "");
		default:
			return getDefaultValue(field, undefined);
	}
}

/**
 * Build memoized editor-field helpers from one manifest document.
 *
 * @param manifest Manifest document that describes the editor field tree.
 * @param options Optional field-model overrides such as labels, hidden paths, and manual controls.
 * @returns Derived field collections plus helpers for reading typed field values from attribute objects.
 * @category React
 */
export function useEditorFields(
	manifest: ManifestDocument,
	options: EditorModelOptions = {},
): UseEditorFieldsResult {
	const optionsKey = JSON.stringify({
		hidden: options.hidden ?? [],
		labels: options.labels ?? {},
		manual: options.manual ?? [],
		preferTextarea: options.preferTextarea ?? [],
	});
	const stableOptions = useMemo(
		() => JSON.parse(optionsKey) as StableEditorModelOptions,
		[optionsKey],
	);
	const fields = useMemo(
		() => createEditorModel(manifest, stableOptions),
		[manifest, stableOptions],
	);
	const fieldMap = useMemo(
		() => new Map(fields.map((field) => [field.path, field])),
		[fields],
	);
	const supportedFields = useMemo(
		() => fields.filter((field) => field.supported),
		[fields],
	);
	const manualFields = useMemo(
		() => fields.filter((field) => !field.supported),
		[fields],
	);

	const getField = (path: string) => fieldMap.get(path);
	const getStringValue = (
		source: object,
		path: string,
		fallback: string,
	) =>
		toStringValue(
			getValueAtPath(source, path) ?? getDefaultValue(getField(path), fallback),
			fallback,
		);
	const getNumberValue = (
		source: object,
		path: string,
		fallback: number,
	) =>
		toNumberValue(
			getValueAtPath(source, path) ?? getDefaultValue(getField(path), fallback),
			fallback,
		);
	const getBooleanValue = (
		source: object,
		path: string,
		fallback: boolean,
	) =>
		toBooleanValue(
			getValueAtPath(source, path) ?? getDefaultValue(getField(path), fallback),
			fallback,
		);
	const getSelectOptions = (
		path: string,
		labelMap?: Record<string, string>,
	) => toSelectOptions(getField(path)?.options ?? [], labelMap);

	return {
		fields,
		fieldMap,
		getBooleanValue,
		getField,
		getNumberValue,
		getSelectOptions,
		getStringValue,
		manualFields,
		supportedFields,
	};
}

/**
 * Create typed attribute update callbacks for manifest-driven editor UIs.
 *
 * @param attributes Current block attribute object.
 * @param setAttributes Callback that applies partial attribute updates.
 * @param validate Optional validator used before committing updates.
 * @returns Typed helpers for key-based and path-based attribute updates.
 * @category React
 */
export function useTypedAttributeUpdater<T extends object>(
	attributes: T,
	setAttributes: (attrs: Partial<T>) => void,
	validate?: (value: T) => ValidationResult<T>,
): TypedAttributeUpdater<T> {
	const validateAttributes = useMemo(
		() => validate ?? ((value: T) => createValidationResult(value)),
		[validate],
	);
	const updateAttribute = useMemo(
		() =>
			createAttributeUpdater(attributes, setAttributes, validateAttributes),
		[attributes, setAttributes, validateAttributes],
	);
	const updatePath = useMemo(
		() =>
			createNestedAttributeUpdater(attributes, setAttributes, validateAttributes),
		[attributes, setAttributes, validateAttributes],
	);
	const updateField = useCallback(
		<K extends keyof T>(path: K | string, value: unknown) => {
			if (typeof path === "string" && path.includes(".")) {
				return updatePath(path, value);
			}

			return updateAttribute(path as K, value as T[K]);
		},
		[updateAttribute, updatePath],
	);

	return {
		updateAttribute,
		updateField,
		updatePath,
	};
}

/**
 * Keep one block attribute populated with a stable document-level id that
 * survives normal edits and repairs duplicates inside the current block tree.
 *
 * `autoRepair` defaults to enabled when omitted. Callers should pass a stable
 * or memoized `blocks` reference so equivalent renders can reuse cached repair
 * analysis instead of re-walking the full document tree.
 *
 * @param options Current block identity inputs including the attribute key, editor tree snapshot, and `setAttributes` callback.
 * @returns The current/pending persistent id plus a helper that can force the attribute repair immediately. `nextPersistentId` can stay `null` when no repair is pending yet, while `ensurePersistentId()` always returns a non-null string.
 * @category React
 */
export function usePersistentBlockIdentity<T extends object>(
	options: UsePersistentBlockIdentityOptions<T>,
): UsePersistentBlockIdentityResult {
	const {
		attributeName,
		attributes,
		autoRepair,
		blockName,
		blocks,
		clientId,
		duplicateDetection,
		prefix,
		setAttributes,
	} = options;
	const pendingRepair = useMemo(
		() =>
			getPersistentBlockIdentityRepairMap(blocks, {
				attributeName,
				blockName,
				duplicateDetection,
				prefix,
			}).get(clientId) ?? null,
		[
			attributeName,
			blockName,
			blocks,
			clientId,
			duplicateDetection,
			prefix,
		],
	);
	const currentPersistentId = getPersistentBlockIdentityValue(
		(attributes as Record<string, unknown>)[attributeName],
	);
	const lastAppliedRepairRef = useRef<string | null>(null);

	const ensurePersistentId = useCallback(() => {
		const nextValue =
			pendingRepair?.nextValue ??
			currentPersistentId ??
			generateScopedClientId(prefix);

		if (nextValue !== currentPersistentId) {
			setAttributes(
				createPersistentIdAttributePatch<T>(
					attributeName,
					nextValue,
				),
			);
		}

		return nextValue;
	}, [
		attributeName,
		currentPersistentId,
		pendingRepair,
		prefix,
		setAttributes,
	]);

	useEffect(() => {
		if (autoRepair === false || !pendingRepair) {
			lastAppliedRepairRef.current = null;
			return;
		}

		const repairKey = `${clientId}:${pendingRepair.reason}:${
			currentPersistentId ?? ""
		}`;
		if (lastAppliedRepairRef.current === repairKey) {
			return;
		}

		lastAppliedRepairRef.current = repairKey;
		setAttributes(
			createPersistentIdAttributePatch<T>(
				attributeName,
				pendingRepair.nextValue,
			),
		);
	}, [
		attributeName,
		autoRepair,
		clientId,
		currentPersistentId,
		pendingRepair,
		setAttributes,
	]);

	return {
		currentPersistentId,
		ensurePersistentId,
		nextPersistentId: pendingRepair?.nextValue ?? currentPersistentId,
		repairReason: pendingRepair?.reason ?? null,
		shouldRepairPersistentId: pendingRepair !== null,
	};
}
