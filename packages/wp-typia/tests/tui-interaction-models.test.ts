import { describe, expect, test } from "bun:test";

import { ADD_FLOW_FIELD_GROUPS } from "../src/ui/add-flow-field-groups";
import {
	getVisibleAddFieldNames,
	isAddPersistenceTemplate,
	sanitizeAddSubmitValues,
} from "../src/ui/add-flow-model";
import { getWrappedFieldNeighbors } from "../src/ui/first-party-form-model";
import {
	getVisibleMigrateFieldNames,
	sanitizeMigrateSubmitValues,
} from "../src/ui/migrate-flow-model";

describe("first-party TUI interaction models", () => {
	test("field neighbor lookup avoids self-loops for single-field states", () => {
		expect(getWrappedFieldNeighbors(["command"], "command")).toEqual({});
		expect(getWrappedFieldNeighbors(["kind", "name", "template"], "name")).toEqual({
			nextFieldName: "template",
			previousFieldName: "kind",
		});
	});

	test("add flow keeps visible field ordering stable across kind switches", () => {
		expect(getVisibleAddFieldNames({ kind: "admin-view" })).toEqual([
			"kind",
			"name",
			"source",
		]);
		expect(getVisibleAddFieldNames({ kind: "block", template: "basic" })).toEqual([
			"kind",
			"name",
			"template",
		]);
		expect(getVisibleAddFieldNames({ kind: "integration-env" })).toEqual([
			"kind",
			"name",
		]);
		expect(
			getVisibleAddFieldNames({ kind: "block", template: "persistence" }),
		).toEqual([
			"kind",
			"name",
			"template",
			"alternate-render-targets",
			"data-storage",
			"persistence-policy",
		]);
		expect(getVisibleAddFieldNames({ kind: "variation" })).toEqual([
			"kind",
			"name",
			"block",
		]);
		expect(getVisibleAddFieldNames({ kind: "core-variation" })).toEqual([
			"kind",
			"name",
			"block",
		]);
		expect(getVisibleAddFieldNames({ kind: "style" })).toEqual([
			"kind",
			"name",
			"block",
		]);
		expect(getVisibleAddFieldNames({ kind: "transform" })).toEqual([
			"kind",
			"name",
			"from",
			"to",
		]);
		expect(getVisibleAddFieldNames({ kind: "binding-source" })).toEqual([
			"kind",
			"name",
			"block",
			"attribute",
			"post-meta",
			"meta-path",
		]);
		expect(getVisibleAddFieldNames({ kind: "contract" })).toEqual([
			"kind",
			"name",
			"type",
		]);
		expect(getVisibleAddFieldNames({ kind: "rest-resource" })).toEqual([
			"kind",
			"name",
			"namespace",
			"methods",
		]);
		expect(getVisibleAddFieldNames({ kind: "post-meta" })).toEqual([
			"kind",
			"name",
			"post-type",
			"type",
		]);
		expect(getVisibleAddFieldNames({ kind: "ability" })).toEqual([
			"kind",
			"name",
		]);
		expect(getVisibleAddFieldNames({ kind: "ai-feature" })).toEqual([
			"kind",
			"name",
			"namespace",
		]);
		expect(getVisibleAddFieldNames({ kind: "hooked-block" })).toEqual([
			"kind",
			"name",
			"anchor",
			"position",
		]);
		expect(getVisibleAddFieldNames({ kind: "pattern" })).toEqual([
			"kind",
			"name",
			"scope",
			"section-role",
			"catalog-title",
			"tags",
			"thumbnail-url",
		]);
		expect(isAddPersistenceTemplate("compound")).toBe(true);
		expect(isAddPersistenceTemplate("basic")).toBe(false);
	});

	test("add flow delegates visible surfaces to focused field groups", () => {
		expect(ADD_FLOW_FIELD_GROUPS.map((group) => group.id)).toEqual([
			"shared",
			"compound-block",
			"pattern-catalog",
			"target-block",
			"transform-target",
			"binding-source",
			"rest-resource",
			"post-meta",
			"hooked-block",
			"editor-plugin",
			"persistence",
		]);
	});

	test("add flow strips hidden fields from submit payloads", () => {
		expect(
			sanitizeAddSubmitValues({
				anchor: "core/post-content",
				block: "counter-card",
				"data-storage": "post-meta",
				kind: "variation",
				name: "hero-card",
				"persistence-policy": "public",
				position: "after",
				template: "compound",
			}),
		).toEqual({
			block: "counter-card",
			kind: "variation",
			name: "hero-card",
		});

		expect(
			sanitizeAddSubmitValues({
				anchor: "",
				block: "",
				"alternate-render-targets": " email,mjml ",
				"data-storage": "custom-table",
				"external-layer-id": " acme/demo ",
				"external-layer-source": " ./layers/demo ",
				kind: "block",
				name: "counter-card",
				"persistence-policy": "authenticated",
				position: "",
				template: "persistence",
			}),
		).toEqual({
			"alternate-render-targets": "email,mjml",
			"data-storage": "custom-table",
			"external-layer-id": "acme/demo",
			"external-layer-source": "./layers/demo",
			kind: "block",
			name: "counter-card",
			"persistence-policy": "authenticated",
			template: "persistence",
		});

		expect(
			sanitizeAddSubmitValues({
				kind: "integration-env",
				name: "local-smoke",
				"release-zip": true,
				service: " docker-compose ",
				"wp-env": true,
			}),
		).toEqual({
			kind: "integration-env",
			name: "local-smoke",
			"release-zip": true,
			service: "docker-compose",
			"wp-env": true,
		});

		expect(
			sanitizeAddSubmitValues({
				anchor: "",
				attribute: " headline ",
				block: "counter-card",
				"alternate-render-targets": " email,mjml ",
				"data-storage": "custom-table",
				"external-layer-id": " acme/demo ",
				"external-layer-source": " ./layers/demo ",
				kind: "variation",
				name: "hero-card",
				"persistence-policy": "authenticated",
				position: "",
				template: "persistence",
			}),
		).toEqual({
			block: "counter-card",
			kind: "variation",
			name: "hero-card",
		});

		expect(
			sanitizeAddSubmitValues({
				attribute: " headline ",
				block: "counter-card",
				kind: "binding-source",
				name: "hero-data",
				template: "persistence",
			}),
		).toEqual({
			attribute: "headline",
			block: "counter-card",
			kind: "binding-source",
			name: "hero-data",
		});

		expect(
			sanitizeAddSubmitValues({
				attribute: "",
				block: "",
				kind: "binding-source",
				name: "hero-data",
			}),
		).toEqual({
			kind: "binding-source",
			name: "hero-data",
		});

		expect(
			sanitizeAddSubmitValues({
				block: " counter-card ",
				from: " core/quote ",
				kind: "style",
				name: "callout-emphasis",
				to: "demo-space/counter-card",
			}),
		).toEqual({
			block: "counter-card",
			kind: "style",
			name: "callout-emphasis",
		});

		expect(
			sanitizeAddSubmitValues({
				block: "counter-card",
				from: " core/quote ",
				kind: "transform",
				name: "quote-to-counter",
				to: " counter-card ",
			}),
		).toEqual({
			from: "core/quote",
			kind: "transform",
			name: "quote-to-counter",
			to: "counter-card",
		});

		expect(
			sanitizeAddSubmitValues({
				"catalog-title": " Homepage Hero ",
				kind: "pattern",
				name: "hero-photo",
				scope: " section ",
				"section-role": " hero ",
				tag: " hero ",
				tags: " landing,featured ",
				"thumbnail-url": " ./thumbnail.png ",
			}),
		).toEqual({
			"catalog-title": "Homepage Hero",
			kind: "pattern",
			name: "hero-photo",
			scope: "section",
			"section-role": "hero",
			tag: "hero",
			tags: "landing,featured",
			"thumbnail-url": "./thumbnail.png",
		});

		expect(
			sanitizeAddSubmitValues({
				anchor: "",
				block: "",
				kind: "admin-view",
				name: "reports",
				position: "",
				source: " rest-resource:reports ",
				template: "persistence",
			}),
		).toEqual({
			kind: "admin-view",
			name: "reports",
			source: "rest-resource:reports",
		});

		expect(
			sanitizeAddSubmitValues({
				anchor: "",
				block: "",
				kind: "contract",
				name: "external-retrieve-response",
				type: " ExternalRetrieveResponse ",
			}),
		).toEqual({
			kind: "contract",
			name: "external-retrieve-response",
			type: "ExternalRetrieveResponse",
		});

		expect(
			sanitizeAddSubmitValues({
				"hide-from-rest": true,
				"meta-key": " _demo_space_integration_state ",
				kind: "post-meta",
				name: "integration-state",
				"post-type": " post ",
				type: " IntegrationStateMeta ",
			}),
		).toEqual({
			"hide-from-rest": true,
			"meta-key": "_demo_space_integration_state",
			kind: "post-meta",
			name: "integration-state",
			"post-type": "post",
			type: "IntegrationStateMeta",
		});

		expect(
			sanitizeAddSubmitValues({
				anchor: "",
				block: "",
				kind: "ability",
				name: "review-workflow",
				namespace: " demo-space/v1 ",
				position: "",
				template: "persistence",
			}),
		).toEqual({
			kind: "ability",
			name: "review-workflow",
		});

		expect(
			sanitizeAddSubmitValues({
				anchor: "",
				block: "",
				kind: "ai-feature",
				name: "brief-suggestions",
				namespace: " demo-space/v1 ",
				position: "",
				template: "persistence",
			}),
		).toEqual({
			kind: "ai-feature",
			name: "brief-suggestions",
			namespace: "demo-space/v1",
		});

		expect(
			sanitizeAddSubmitValues({
				anchor: "",
				auth: " authenticated ",
				block: "",
				"body-type": " ExternalRecordRequest ",
				kind: "rest-resource",
				manual: true,
				method: " POST ",
				methods: " list,read,create ",
				name: "snapshots",
				namespace: " demo-space/v1 ",
				path: " /records/(?P<id>[\\d]+) ",
				position: "",
					"query-type": " ExternalRecordQuery ",
					"response-type": " ExternalRecordResponse ",
					"secret-field": " apiKey ",
					"secret-state-field": " hasApiKey ",
					template: "persistence",
				}),
			).toEqual({
			auth: "authenticated",
			"body-type": "ExternalRecordRequest",
			kind: "rest-resource",
			manual: true,
			method: "POST",
			methods: "list,read,create",
			name: "snapshots",
			namespace: "demo-space/v1",
				path: "/records/(?P<id>[\\d]+)",
				"query-type": "ExternalRecordQuery",
				"response-type": "ExternalRecordResponse",
				"secret-field": "apiKey",
				"secret-state-field": "hasApiKey",
			});
	});

	test("migrate flow keeps visible field ordering stable across command switches", () => {
		expect(getVisibleMigrateFieldNames({ command: "wizard" })).toEqual(["command"]);
		expect(getVisibleMigrateFieldNames({ command: "plan" })).toEqual([
			"command",
			"from-migration-version",
			"to-migration-version",
		]);
		expect(getVisibleMigrateFieldNames({ command: "fixtures" })).toEqual([
			"command",
			"from-migration-version",
			"to-migration-version",
			"all",
			"force",
		]);
		expect(getVisibleMigrateFieldNames({ command: "fuzz" })).toEqual([
			"command",
			"from-migration-version",
			"all",
			"iterations",
			"seed",
		]);
	});

	test("migrate flow strips hidden and empty fields from submit payloads", () => {
		expect(
			sanitizeMigrateSubmitValues({
				all: true,
				command: "wizard",
				"current-migration-version": "",
				force: true,
				"from-migration-version": "  ",
				iterations: "10",
				"migration-version": "",
				seed: "demo",
				"to-migration-version": "current",
			}),
		).toEqual({
			command: "wizard",
		});

		expect(
			sanitizeMigrateSubmitValues({
				all: false,
				command: "fixtures",
				"current-migration-version": "",
				force: true,
				"from-migration-version": "v1",
				iterations: "",
				"migration-version": "",
				seed: "",
				"to-migration-version": "current",
			}),
		).toEqual({
			all: false,
			command: "fixtures",
			force: true,
			"from-migration-version": "v1",
			"to-migration-version": "current",
		});
	});
});
