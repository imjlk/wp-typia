import type {
	ElementType,
	ReactNode,
} from "react";

import type {
	EditorFieldDescriptor,
} from "./editor.js";
import type {
	PersistentBlockIdentityNode,
	PersistentBlockIdentityRepairReason,
} from "./identifiers.js";

/**
 * Describe one string-valued option for an inspector select control.
 *
 * @category React
 */
export interface InspectorSelectOption {
	label: string;
	value: string;
}

/**
 * Describe the minimum props supported by a collapsible inspector panel shell.
 *
 * @category React
 */
export interface PanelBodyLikeProps {
	children?: ReactNode;
	initialOpen?: boolean;
	title?: ReactNode;
}

/**
 * Describe the minimum props supported by a boolean inspector control.
 *
 * @category React
 */
export interface ToggleControlLikeProps {
	checked?: boolean;
	help?: ReactNode;
	label?: ReactNode;
	onChange?: (value: boolean) => void;
}

/**
 * Describe the minimum props supported by a select-style inspector control.
 *
 * @category React
 */
export interface SelectControlLikeProps {
	help?: ReactNode;
	label?: ReactNode;
	onChange?: (value: string) => void;
	options?: readonly InspectorSelectOption[];
	value?: string;
}

/**
 * Describe the minimum props supported by a numeric range inspector control.
 *
 * @category React
 */
export interface RangeControlLikeProps {
	help?: ReactNode;
	label?: ReactNode;
	max?: number;
	min?: number;
	onChange?: (value?: number) => void;
	step?: number;
	value?: number;
}

/**
 * Describe the minimum props supported by a single-line text inspector control.
 *
 * @category React
 */
export interface TextControlLikeProps {
	help?: ReactNode;
	label?: ReactNode;
	max?: number;
	min?: number;
	onBlur?: () => void;
	onChange?: (value: string) => void;
	step?: number;
	type?: string;
	value?: string;
}

/**
 * Describe the minimum props supported by a multiline text inspector control.
 *
 * @category React
 */
export interface TextareaControlLikeProps {
	help?: ReactNode;
	label?: ReactNode;
	onChange?: (value: string) => void;
	value?: string;
}

/**
 * Map optional WordPress component implementations used by inspector helpers.
 *
 * @category React
 */
export interface InspectorComponentMap {
	PanelBody?: ElementType<PanelBodyLikeProps>;
	RangeControl?: ElementType<RangeControlLikeProps>;
	SelectControl?: ElementType<SelectControlLikeProps>;
	TextControl?: ElementType<TextControlLikeProps>;
	TextareaControl?: ElementType<TextareaControlLikeProps>;
	ToggleControl?: ElementType<ToggleControlLikeProps>;
}

/**
 * Describe the derived field helpers returned from `useEditorFields()`.
 *
 * @category React
 */
export interface UseEditorFieldsResult {
	fields: EditorFieldDescriptor[];
	fieldMap: Map<string, EditorFieldDescriptor>;
	getBooleanValue: (
		source: object,
		path: string,
		fallback: boolean,
	) => boolean;
	getField: (path: string) => EditorFieldDescriptor | undefined;
	getNumberValue: (
		source: object,
		path: string,
		fallback: number,
	) => number;
	getSelectOptions: (
		path: string,
		labelMap?: Record<string, string>,
	) => InspectorSelectOption[];
	getStringValue: (
		source: object,
		path: string,
		fallback: string,
	) => string;
	manualFields: EditorFieldDescriptor[];
	supportedFields: EditorFieldDescriptor[];
}

/**
 * Describe typed update helpers for manifest-backed block attributes.
 *
 * @category React
 */
export interface TypedAttributeUpdater<T extends object> {
	updateAttribute: <K extends keyof T>(key: K, value: T[K]) => boolean;
	updateField: <K extends keyof T>(path: K | string, value: unknown) => boolean;
	updatePath: (path: string, value: unknown) => boolean;
}

export type AttributeNameFor<T extends object> =
	[Extract<keyof T, string>] extends [never]
		? string
		: Extract<keyof T, string>;

/**
 * Describe the options accepted by `usePersistentBlockIdentity()`.
 *
 * `autoRepair` defaults to enabled when omitted. Pass a stable or memoized
 * `blocks` reference so equivalent renders can reuse the same duplicate-repair
 * analysis instead of recomputing it. Set `blockName` when one editor tree can
 * contain multiple block types that use the same identity attribute name.
 *
 * @category React
 */
export interface UsePersistentBlockIdentityOptions<T extends object> {
	attributeName: AttributeNameFor<T>;
	attributes: T;
	autoRepair?: boolean;
	blockName?: string;
	blocks: readonly PersistentBlockIdentityNode[];
	clientId: string;
	duplicateDetection?: boolean;
	prefix: string;
	setAttributes: (attrs: Partial<T>) => void;
}

/**
 * Describe the duplicate-safe id lifecycle helpers returned from
 * `usePersistentBlockIdentity()`.
 *
 * `nextPersistentId` mirrors the current pending repair target and can be
 * `null` when no repair is pending yet. Use `ensurePersistentId()` when you
 * need a guaranteed non-null id for immediate writes or orchestration.
 *
 * @category React
 */
export interface UsePersistentBlockIdentityResult {
	currentPersistentId: string | null;
	ensurePersistentId: () => string;
	nextPersistentId: string | null;
	repairReason: PersistentBlockIdentityRepairReason | null;
	shouldRepairPersistentId: boolean;
}

/**
 * Describe the resolved render context passed to custom field-control renderers.
 *
 * @category React
 */
export interface FieldControlRenderContext {
	components: InspectorComponentMap;
	field: EditorFieldDescriptor;
	help?: ReactNode;
	label?: ReactNode;
	max?: number;
	min?: number;
	onChange: (value: unknown) => void;
	options?: readonly InspectorSelectOption[];
	step?: number;
	value: unknown;
}

/**
 * Describe the props accepted by the generic `FieldControl` renderer.
 *
 * @category React
 */
export interface FieldControlProps {
	components?: InspectorComponentMap;
	field: EditorFieldDescriptor;
	help?: ReactNode;
	label?: ReactNode;
	max?: number;
	min?: number;
	onChange: (value: unknown) => void;
	options?: readonly InspectorSelectOption[];
	render?: (context: FieldControlRenderContext) => ReactNode;
	renderUnsupported?: (context: FieldControlRenderContext) => ReactNode;
	step?: number;
	value: unknown;
}

/**
 * Describe optional per-field overrides for manifest-driven inspector rendering.
 *
 * @category React
 */
export interface InspectorFieldOverride {
	help?: ReactNode;
	label?: ReactNode;
	max?: number;
	min?: number;
	options?: readonly InspectorSelectOption[];
	render?: (context: FieldControlRenderContext) => ReactNode;
	renderUnsupported?: (context: FieldControlRenderContext) => ReactNode;
	step?: number;
}

/**
 * Describe the props accepted by `InspectorFromManifest()`.
 *
 * @category React
 */
export interface InspectorFromManifestProps<T extends object> {
	attributes: T;
	children?: ReactNode;
	components?: InspectorComponentMap;
	fieldLookup: UseEditorFieldsResult;
	fieldOverrides?: Record<string, InspectorFieldOverride>;
	initialOpen?: boolean;
	onChange: (path: string, value: unknown) => void;
	paths: readonly string[];
	title?: ReactNode;
}

export interface StableEditorModelOptions {
	hidden: string[];
	labels: Record<string, string>;
	manual: string[];
	preferTextarea: string[];
}

export type {
	EditorFieldDescriptor,
	EditorFieldOption,
	EditorModelOptions,
} from "./editor.js";
export type {
	PersistentBlockIdentityNode,
	PersistentBlockIdentityRepair,
	PersistentBlockIdentityRepairReason,
} from "./identifiers.js";
