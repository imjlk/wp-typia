import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import {
	FieldControl,
	InspectorFromManifest,
	useEditorFields,
	usePersistentBlockIdentity,
	useTypedAttributeUpdater,
	type EditorFieldDescriptor,
	type InspectorComponentMap,
	type ManifestAttribute,
	type ManifestDocument,
	type PersistentBlockIdentityNode,
	type ValidationResult,
} from "../../packages/wp-typia-block-runtime/src/inspector";

interface AttributeOverride {
	typia?: Partial<ManifestAttribute["typia"]>;
	ts?: Partial<ManifestAttribute["ts"]>;
	wp?: Partial<ManifestAttribute["wp"]>;
}

function createAttribute(overrides: AttributeOverride): ManifestAttribute {
	return {
		typia: {
			constraints: {
				exclusiveMaximum: null,
				exclusiveMinimum: null,
				format: null,
				maxLength: null,
				maxItems: null,
				maximum: null,
				minLength: null,
				minItems: null,
				minimum: null,
				multipleOf: null,
				pattern: null,
				typeTag: null,
			},
			defaultValue: null,
			hasDefault: false,
			...(overrides.typia ?? {}),
		},
		ts: {
			items: null,
			kind: "string",
			required: false,
			union: null,
			...(overrides.ts ?? {}),
		},
		wp: {
			defaultValue: null,
			enum: null,
			hasDefault: false,
			type: "string",
			...(overrides.wp ?? {}),
		},
	};
}

function renderHook<T>(useValue: () => T): T {
	let captured!: T;

	function Harness() {
		captured = useValue();
		return null;
	}

	renderToStaticMarkup(<Harness />);

	return captured;
}

const TEST_COMPONENTS: InspectorComponentMap = {
	PanelBody: ({ children, title }) => (
		<section data-panel-title={String(title ?? "")}>{children}</section>
	),
	RangeControl: ({ label, max, min, step, value }) => (
		<div
			data-control="range"
			data-label={String(label ?? "")}
			data-max={String(max ?? "")}
			data-min={String(min ?? "")}
			data-step={String(step ?? "")}
			data-value={String(value ?? "")}
		/>
	),
	SelectControl: ({ label, options, value }) => (
		<div
			data-control="select"
			data-label={String(label ?? "")}
			data-options={(options ?? []).map((option) => option.value).join(",")}
			data-value={String(value ?? "")}
		/>
	),
	TextControl: ({ label, type, value }) => (
		<div
			data-control={type === "number" ? "number" : "text"}
			data-label={String(label ?? "")}
			data-value={String(value ?? "")}
		/>
	),
	TextareaControl: ({ label, value }) => (
		<div
			data-control="textarea"
			data-label={String(label ?? "")}
			data-value={String(value ?? "")}
		/>
	),
	ToggleControl: ({ checked, label }) => (
		<div
			data-control="toggle"
			data-label={String(label ?? "")}
			data-value={String(Boolean(checked))}
		/>
	),
};

describe("runtime inspector helpers", () => {
	test("inspector runtime facade delegates model and control helpers to focused modules", () => {
		const runtimeRoot = resolve(
			import.meta.dir,
			"..",
			"..",
			"packages",
			"wp-typia-block-runtime",
			"src",
		);
		const inspectorRuntimeSource = readFileSync(
			resolve(runtimeRoot, "inspector-runtime.tsx"),
			"utf8",
		);
		const inspectorModelSource = readFileSync(
			resolve(runtimeRoot, "inspector-runtime-model.tsx"),
			"utf8",
		);
		const inspectorControlsSource = readFileSync(
			resolve(runtimeRoot, "inspector-runtime-controls.tsx"),
			"utf8",
		);

		expect(inspectorRuntimeSource).toContain(
			'from "./inspector-runtime-types.js"',
		);
		expect(inspectorRuntimeSource).toContain(
			'from "./inspector-runtime-model.js"',
		);
		expect(inspectorRuntimeSource).toContain(
			'from "./inspector-runtime-controls.js"',
		);
		expect(inspectorRuntimeSource).not.toContain("function getPathSegments(");
		expect(inspectorRuntimeSource).not.toContain("export function useEditorFields(");
		expect(inspectorRuntimeSource).not.toContain(
			"export function usePersistentBlockIdentity(",
		);
		expect(inspectorRuntimeSource).not.toContain("export function FieldControl(");
		expect(inspectorModelSource).toContain("export function useEditorFields(");
		expect(inspectorModelSource).toContain(
			"export function useTypedAttributeUpdater<",
		);
		expect(inspectorModelSource).toContain(
			"export function usePersistentBlockIdentity<",
		);
		expect(inspectorControlsSource).toContain(
			"export function FieldControl(",
		);
		expect(inspectorControlsSource).toContain(
			"export function InspectorFromManifest<",
		);
	});

	test("useEditorFields partitions manual fields and resolves defaults", () => {
		const manifest: ManifestDocument = {
			attributes: {
				alignment: createAttribute({
					typia: {
						defaultValue: "left",
						hasDefault: true,
					},
					wp: {
						defaultValue: "left",
						enum: ["left", "center", "right"],
						hasDefault: true,
						type: "string",
					},
				}),
				content: createAttribute({
					typia: {
						defaultValue: "",
						hasDefault: true,
					},
				}),
				isVisible: createAttribute({
					typia: {
						defaultValue: true,
						hasDefault: true,
					},
					ts: {
						items: null,
						kind: "boolean",
						required: false,
						union: null,
					},
					wp: {
						defaultValue: true,
						enum: null,
						hasDefault: true,
						type: "boolean",
					},
				}),
				padding: createAttribute({
					ts: {
						items: null,
						kind: "object",
						properties: {
							top: createAttribute({
								typia: {
									constraints: {
										exclusiveMaximum: null,
										exclusiveMinimum: null,
										format: null,
										maxLength: null,
										maxItems: null,
										maximum: null,
										minLength: null,
										minItems: null,
										minimum: 0,
										multipleOf: null,
										pattern: null,
										typeTag: "uint32",
									},
									defaultValue: 4,
									hasDefault: true,
								},
								ts: {
									items: null,
									kind: "number",
									required: false,
									union: null,
								},
								wp: {
									defaultValue: 4,
									enum: null,
									hasDefault: true,
									type: "number",
								},
							}),
						},
						required: false,
						union: null,
					},
				}),
				linkTarget: createAttribute({
					ts: {
						items: null,
						kind: "union",
						properties: null,
						required: false,
						union: {
							branches: {},
							discriminator: "kind",
						},
					},
				}),
			},
			manifestVersion: 2,
			sourceType: "InspectorAttributes",
		};

		const editorFields = renderHook(() =>
			useEditorFields(manifest, {
				manual: ["linkTarget"],
				preferTextarea: ["content"],
			}),
		);

		expect(editorFields.supportedFields.some((field) => field.path === "alignment")).toBe(
			true,
		);
		expect(editorFields.manualFields.some((field) => field.path === "linkTarget")).toBe(
			true,
		);
		expect(editorFields.getField("padding.top")?.control).toBe("number");
		expect(editorFields.getStringValue({}, "alignment", "right")).toBe("left");
		expect(editorFields.getBooleanValue({}, "isVisible", false)).toBe(true);
		expect(
			editorFields.getNumberValue({ padding: { top: 12 } }, "padding.top", 0),
		).toBe(12);
		expect(editorFields.getSelectOptions("alignment")).toEqual([
			{ label: "Left", value: "left" },
			{ label: "Center", value: "center" },
			{ label: "Right", value: "right" },
		]);
	});

	test("useTypedAttributeUpdater applies validated top-level and nested patches", () => {
		interface Attributes {
			content: string;
			id?: string;
			padding?: {
				top?: number;
			};
		}

		const patches: Array<Partial<Attributes>> = [];
		const attributes: Attributes = {
			content: "Hello",
		};
		const validate = (value: Attributes): ValidationResult<Attributes> => {
			if (value.content.length === 0) {
				return {
					errors: [
						{
							expected: "Non-empty content",
							path: "$.content",
							value: value.content,
						},
					],
					isValid: false,
				};
			}

			return {
				data: {
					...value,
					id: value.id ?? "generated-id",
				},
				errors: [],
				isValid: true,
			};
		};
		const updater = renderHook(() =>
			useTypedAttributeUpdater(attributes, (patch) => {
				patches.push(patch);
			}, validate),
		);

		expect(updater.updateAttribute("content", "Updated")).toBe(true);
		expect(patches[0]).toEqual({
			content: "Updated",
			id: "generated-id",
		});

		expect(updater.updateField("padding.top", 24)).toBe(true);
		expect(patches[1]).toEqual({
			id: "generated-id",
			padding: {
				top: 24,
			},
		});

		expect(updater.updateField("content", "")).toBe(false);
		expect(patches).toHaveLength(2);
	});

	test("usePersistentBlockIdentity reports pending repairs for missing and duplicate ids", () => {
		const blocks: PersistentBlockIdentityNode[] = [
			{
				attributes: {
					sectionId: "sec-keep",
				},
				clientId: "parent",
				innerBlocks: [
					{
						attributes: {},
						clientId: "child-missing",
					},
					{
						attributes: {
							sectionId: "sec-keep",
						},
						clientId: "child-duplicate",
					},
				],
			},
		];
		const patches: Array<Record<string, unknown>> = [];

		const missingIdentity = renderHook(() =>
			usePersistentBlockIdentity({
				attributeName: "sectionId",
				attributes: {},
				autoRepair: false,
				blocks,
				clientId: "child-missing",
				prefix: "sec",
				setAttributes: (patch) => {
					patches.push(patch);
				},
			}),
		);
		const duplicateIdentity = renderHook(() =>
			usePersistentBlockIdentity({
				attributeName: "sectionId",
				attributes: {
					sectionId: "sec-keep",
				},
				autoRepair: false,
				blocks,
				clientId: "child-duplicate",
				prefix: "sec",
				setAttributes: (patch) => {
					patches.push(patch);
				},
			}),
		);

		expect(missingIdentity.currentPersistentId).toBeNull();
		expect(missingIdentity.nextPersistentId).toMatch(/^sec-[a-z0-9]{9}$/);
		expect(missingIdentity.repairReason).toBe("missing");
		expect(missingIdentity.shouldRepairPersistentId).toBe(true);

		expect(duplicateIdentity.currentPersistentId).toBe("sec-keep");
		expect(duplicateIdentity.nextPersistentId).toMatch(/^sec-[a-z0-9]{9}$/);
		expect(duplicateIdentity.nextPersistentId).not.toBe("sec-keep");
		expect(duplicateIdentity.repairReason).toBe("duplicate");
		expect(duplicateIdentity.shouldRepairPersistentId).toBe(true);

		const expectedMissingId = missingIdentity.nextPersistentId;
		const expectedDuplicateId = duplicateIdentity.nextPersistentId;
		const ensuredMissingId = missingIdentity.ensurePersistentId();
		const ensuredDuplicateId = duplicateIdentity.ensurePersistentId();

		expect(expectedMissingId).not.toBeNull();
		expect(expectedDuplicateId).not.toBeNull();
		if (expectedMissingId === null || expectedDuplicateId === null) {
			throw new Error("identity helper should precompute repair ids");
		}
		expect(ensuredMissingId).toBe(expectedMissingId);
		expect(ensuredDuplicateId).toBe(expectedDuplicateId);
		expect(patches).toEqual([
			{
				sectionId: ensuredMissingId,
			},
			{
				sectionId: ensuredDuplicateId,
			},
		]);
	});

	test("usePersistentBlockIdentity preserves stable ids during normal edits", () => {
		const patches: Array<Record<string, unknown>> = [];
		const identity = renderHook(() =>
			usePersistentBlockIdentity({
				attributeName: "sectionId",
				attributes: {
					sectionId: "custom-stable",
				},
				autoRepair: false,
				blocks: [
					{
						attributes: {
							sectionId: "custom-stable",
						},
						clientId: "solo",
					},
				],
				clientId: "solo",
				prefix: "sec",
				setAttributes: (patch) => {
					patches.push(patch);
				},
			}),
		);

		expect(identity.currentPersistentId).toBe("custom-stable");
		expect(identity.nextPersistentId).toBe("custom-stable");
		expect(identity.repairReason).toBeNull();
		expect(identity.shouldRepairPersistentId).toBe(false);
		expect(identity.ensurePersistentId()).toBe("custom-stable");
		expect(patches).toEqual([]);
	});

	test("FieldControl maps supported field kinds and skips unsupported fields by default", () => {
		const selectField: EditorFieldDescriptor = {
			constraints: {},
			control: "select",
			defaultValue: "left",
			hasDefault: true,
			key: "alignment",
			kind: "string",
			label: "Alignment",
			maximum: null,
			minimum: null,
			options: [
				{ label: "Left", value: "left" },
				{ label: "Right", value: "right" },
			],
			path: "alignment",
			required: false,
			step: null,
			supported: true,
		};
		const toggleField: EditorFieldDescriptor = {
			...selectField,
			control: "toggle",
			key: "isVisible",
			label: "Visible",
			options: [],
			path: "isVisible",
		};
		const rangeField: EditorFieldDescriptor = {
			...selectField,
			control: "range",
			key: "opacity",
			label: "Opacity",
			maximum: 1,
			minimum: 0,
			options: [],
			path: "opacity",
			step: 0.25,
		};
		const numberField: EditorFieldDescriptor = {
			...selectField,
			control: "number",
			key: "borderRadius",
			label: "Border Radius",
			options: [],
			path: "borderRadius",
			step: 1,
		};
		const textField: EditorFieldDescriptor = {
			...selectField,
			control: "text",
			key: "className",
			label: "CSS Class",
			options: [],
			path: "className",
		};
		const textareaField: EditorFieldDescriptor = {
			...selectField,
			control: "textarea",
			key: "content",
			label: "Content",
			options: [],
			path: "content",
		};
		const unsupportedField: EditorFieldDescriptor = {
			...selectField,
			control: "unsupported",
			key: "linkTarget",
			label: "Link Target",
			options: [],
			path: "linkTarget",
			reason: "manual",
			supported: false,
		};

		const rendered = renderToStaticMarkup(
			<div>
				<FieldControl
					components={TEST_COMPONENTS}
					field={toggleField}
					onChange={() => undefined}
					value={true}
				/>
				<FieldControl
					components={TEST_COMPONENTS}
					field={selectField}
					onChange={() => undefined}
					value="right"
				/>
				<FieldControl
					components={TEST_COMPONENTS}
					field={rangeField}
					onChange={() => undefined}
					value={0.5}
				/>
				<FieldControl
					components={TEST_COMPONENTS}
					field={numberField}
					onChange={() => undefined}
					value={8}
				/>
				<FieldControl
					components={TEST_COMPONENTS}
					field={textField}
					onChange={() => undefined}
					value="custom-class"
				/>
				<FieldControl
					components={TEST_COMPONENTS}
					field={textareaField}
					onChange={() => undefined}
					value="Long form"
				/>
				<FieldControl
					components={TEST_COMPONENTS}
					field={unsupportedField}
					onChange={() => undefined}
					value={undefined}
				/>
				<FieldControl
					components={TEST_COMPONENTS}
					field={unsupportedField}
					onChange={() => undefined}
					renderUnsupported={({ field }) => (
						<div data-control="unsupported" data-label={field.label} />
					)}
					value={undefined}
				/>
			</div>,
		);

		expect(rendered).toContain('data-control="toggle"');
		expect(rendered).toContain('data-control="select"');
		expect(rendered).toContain('data-control="range"');
		expect(rendered).toContain('data-control="number"');
		expect(rendered).toContain('data-control="text"');
		expect(rendered).toContain('data-control="textarea"');
		expect(rendered).toContain('data-control="unsupported"');
		expect(rendered).toContain('data-options="left,right"');
	});

	test("FieldControl preserves manifest enum value types when select labels are overridden", () => {
		const numericSelectField: EditorFieldDescriptor = {
			constraints: {},
			control: "select",
			defaultValue: 1,
			hasDefault: true,
			key: "maxClicks",
			kind: "number",
			label: "Max Clicks",
			maximum: null,
			minimum: null,
			options: [
				{ label: "One", value: 1 },
				{ label: "Two", value: 2 },
			],
			path: "maxClicks",
			required: false,
			step: 1,
			supported: true,
		};
		let updatedValue: unknown;
		const triggeringComponents: InspectorComponentMap = {
			...TEST_COMPONENTS,
			SelectControl: ( { onChange } ) => {
				onChange?.( "1" );
				return <div data-control="select" />;
			},
		};

		renderToStaticMarkup(
			<FieldControl
				components={ triggeringComponents }
				field={ numericSelectField }
				onChange={ ( value ) => {
					updatedValue = value;
				} }
				options={ [
					{ label: "One click", value: "1" },
					{ label: "Two clicks", value: "2" },
				] }
				value={ 2 }
			/>,
		);

		expect( updatedValue ).toBe( 1 );
	});

	test("InspectorFromManifest preserves order and applies field overrides", () => {
		const manifest: ManifestDocument = {
			attributes: {
				alignment: createAttribute({
					typia: {
						defaultValue: "left",
						hasDefault: true,
					},
					wp: {
						defaultValue: "left",
						enum: ["left", "center"],
						hasDefault: true,
						type: "string",
					},
				}),
				notes: createAttribute({
					typia: {
						defaultValue: "",
						hasDefault: true,
					},
				}),
				linkTarget: createAttribute({
					ts: {
						items: null,
						kind: "union",
						properties: null,
						required: false,
						union: {
							branches: {},
							discriminator: "kind",
						},
					},
				}),
			},
			manifestVersion: 2,
			sourceType: "InspectorFields",
		};
		const editorFields = renderHook(() => useEditorFields(manifest));
		const rendered = renderToStaticMarkup(
			<InspectorFromManifest
				attributes={{ alignment: "center", notes: "Body copy" }}
				components={TEST_COMPONENTS}
				fieldLookup={editorFields}
				fieldOverrides={{
					notes: {
						label: "Body",
					},
				}}
				onChange={() => undefined}
				paths={["alignment", "notes", "linkTarget"]}
				title="Settings"
			>
				<div data-extra="after-fields" />
			</InspectorFromManifest>,
		);

		expect(rendered).toContain('data-panel-title="Settings"');
		expect(rendered).toContain('data-label="Alignment"');
		expect(rendered).toContain('data-label="Body"');
		expect(rendered).toContain('data-extra="after-fields"');
		expect(rendered).not.toContain('data-label="Link Target"');
		expect(rendered.indexOf('data-label="Alignment"')).toBeLessThan(
			rendered.indexOf('data-label="Body"'),
		);
	});
});
