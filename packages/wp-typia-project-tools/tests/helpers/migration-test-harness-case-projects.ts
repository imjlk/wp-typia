import * as fs from "node:fs";
import * as path from "node:path";

import {
	createManifestAttribute,
	createObjectBranchManifestAttribute,
	createUnionManifestAttribute,
	type ManifestAttribute,
	HELPERS_SOURCE,
} from "./migration-test-harness-manifest.js";
import {
	createProjectShell,
	repoTtsxPath,
	writeFile,
	writeJson,
} from "./migration-test-harness-runtime.js";
import { writeCurrentSnapshot } from "./migration-test-harness-basic-projects.js";

export function createRenameCandidateProject(projectDir: string) {
	createProjectShell(projectDir);

	writeFile(
		path.join(projectDir, "src", "validators.ts"),
		`export const validators = {\n\tvalidate(input: Record<string, unknown>) {\n\t\tconst success = typeof input.content === "string";\n\t\treturn success\n\t\t\t? { success: true as const, data: input }\n\t\t\t: { success: false as const, errors: [{ path: "$", expected: "RenameAttributes" }] };\n\t},\n\trandom() {\n\t\treturn { content: "Hello" };\n\t},\n};\n`,
	);
	writeFile(
		path.join(projectDir, "src", "migrations", "config.ts"),
		`export const migrationConfig = {\n\tblockName: "create-block/rename-smoke",\n\tcurrentMigrationVersion: "v3",\n\tsupportedMigrationVersions: ["v1", "v3"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`,
	);
	writeFile(
		path.join(projectDir, "src", "migrations", "helpers.ts"),
		HELPERS_SOURCE,
	);
	writeJson(path.join(projectDir, "block.json"), {
		apiVersion: 3,
		attributes: {
			content: { type: "string" },
		},
		name: "create-block/rename-smoke",
		title: "Rename Smoke",
	});
	writeJson(path.join(projectDir, "typia.manifest.json"), {
		attributes: {
			content: createManifestAttribute("string", {
				required: true,
			}),
		},
		manifestVersion: 2,
		sourceType: "RenameAttributes",
	});
	writeJson(path.join(projectDir, "src", "migrations", "versions", "v1", "block.json"), {
		apiVersion: 3,
		attributes: {
			headline: { type: "string" },
		},
		name: "create-block/rename-smoke",
		title: "Rename Smoke",
	});
	writeJson(path.join(projectDir, "src", "migrations", "versions", "v1", "typia.manifest.json"), {
		attributes: {
			headline: createManifestAttribute("string", {
				required: true,
			}),
		},
		manifestVersion: 2,
		sourceType: "RenameAttributes",
	});
	writeFile(
		path.join(projectDir, "src", "migrations", "versions", "v1", "save.tsx"),
		`export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.headline ?? null;\n}\n`,
	);
	writeCurrentSnapshot(projectDir);

	const localBinDir = path.join(projectDir, "node_modules", ".bin");
	fs.mkdirSync(localBinDir, { recursive: true });
	fs.symlinkSync(repoTtsxPath, path.join(localBinDir, "ttsx"));
}

export function createNestedRenameProject(projectDir: string) {
	createProjectShell(projectDir);

	writeFile(
		path.join(projectDir, "src", "save.tsx"),
		`export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.settings?.label ?? null;\n}\n`,
	);
	writeFile(
		path.join(projectDir, "src", "validators.ts"),
		`export const validators = {\n\tvalidate(input: Record<string, unknown>) {\n\t\tconst settings = input.settings as Record<string, unknown> | undefined;\n\t\tconst success =\n\t\t\ttypeof settings === "object" &&\n\t\t\tsettings !== null &&\n\t\t\ttypeof settings.label === "string";\n\t\treturn success\n\t\t\t? { success: true as const, data: input }\n\t\t\t: { success: false as const, errors: [{ path: "$.settings.label", expected: "string" }] };\n\t},\n\trandom() {\n\t\treturn { settings: { label: "Hello" } };\n\t},\n};\n`,
	);
	writeFile(
		path.join(projectDir, "src", "migrations", "config.ts"),
		`export const migrationConfig = {\n\tblockName: "create-block/nested-rename",\n\tcurrentMigrationVersion: "v3",\n\tsupportedMigrationVersions: ["v1", "v3"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`,
	);
	writeFile(path.join(projectDir, "src", "migrations", "helpers.ts"), HELPERS_SOURCE);
	writeJson(path.join(projectDir, "block.json"), {
		apiVersion: 3,
		attributes: {
			settings: { type: "object" },
		},
		name: "create-block/nested-rename",
		title: "Nested Rename",
	});
	writeJson(path.join(projectDir, "typia.manifest.json"), {
		attributes: {
			settings: {
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
				},
				ts: {
					items: null,
					kind: "object",
					properties: {
						label: createManifestAttribute("string", { required: true }),
					},
					required: true,
					union: null,
				},
				wp: {
					defaultValue: null,
					enum: null,
					hasDefault: false,
					type: "object",
				},
			},
		},
		manifestVersion: 2,
		sourceType: "NestedRenameAttributes",
	});
	writeJson(path.join(projectDir, "src", "migrations", "versions", "v1", "block.json"), {
		apiVersion: 3,
		attributes: {
			settings: { type: "object" },
		},
		name: "create-block/nested-rename",
		title: "Nested Rename",
	});
	writeJson(path.join(projectDir, "src", "migrations", "versions", "v1", "typia.manifest.json"), {
		attributes: {
			settings: {
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
				},
				ts: {
					items: null,
					kind: "object",
					properties: {
						title: createManifestAttribute("string", { required: true }),
					},
					required: true,
					union: null,
				},
				wp: {
					defaultValue: null,
					enum: null,
					hasDefault: false,
					type: "object",
				},
			},
		},
		manifestVersion: 2,
		sourceType: "NestedRenameAttributes",
	});
	writeFile(
		path.join(projectDir, "src", "migrations", "versions", "v1", "save.tsx"),
		`export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.settings?.title ?? null;\n}\n`,
	);
	writeCurrentSnapshot(projectDir);

	const localBinDir = path.join(projectDir, "node_modules", ".bin");
	fs.mkdirSync(localBinDir, { recursive: true });
	fs.symlinkSync(repoTtsxPath, path.join(localBinDir, "ttsx"));
}

export function createAmbiguousRenameProject(projectDir: string) {
	createProjectShell(projectDir);

	writeFile(
		path.join(projectDir, "src", "validators.ts"),
		`export const validators = {\n\tvalidate(input: Record<string, unknown>) {\n\t\tconst success = typeof input.content === "string";\n\t\treturn success\n\t\t\t? { success: true as const, data: input }\n\t\t\t: { success: false as const, errors: [{ path: "$", expected: "AmbiguousRenameAttributes" }] };\n\t},\n\trandom() {\n\t\treturn { content: "Hello" };\n\t},\n};\n`,
	);
	writeFile(
		path.join(projectDir, "src", "migrations", "config.ts"),
		`export const migrationConfig = {\n\tblockName: "create-block/ambiguous-rename",\n\tcurrentMigrationVersion: "v3",\n\tsupportedMigrationVersions: ["v1", "v3"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`,
	);
	writeFile(
		path.join(projectDir, "src", "migrations", "helpers.ts"),
		HELPERS_SOURCE,
	);
	writeJson(path.join(projectDir, "block.json"), {
		apiVersion: 3,
		attributes: {
			content: { type: "string" },
		},
		name: "create-block/ambiguous-rename",
		title: "Ambiguous Rename",
	});
	writeJson(path.join(projectDir, "typia.manifest.json"), {
		attributes: {
			content: createManifestAttribute("string", {
				required: true,
			}),
		},
		manifestVersion: 2,
		sourceType: "AmbiguousRenameAttributes",
	});
	writeJson(path.join(projectDir, "src", "migrations", "versions", "v1", "block.json"), {
		apiVersion: 3,
		attributes: {
			body: { type: "string" },
			headline: { type: "string" },
		},
		name: "create-block/ambiguous-rename",
		title: "Ambiguous Rename",
	});
	writeJson(path.join(projectDir, "src", "migrations", "versions", "v1", "typia.manifest.json"), {
		attributes: {
			body: createManifestAttribute("string", {
				required: true,
			}),
			headline: createManifestAttribute("string", {
				required: true,
			}),
		},
		manifestVersion: 2,
		sourceType: "AmbiguousRenameAttributes",
	});
	writeFile(
		path.join(projectDir, "src", "migrations", "versions", "v1", "save.tsx"),
		`export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.headline ?? attributes.body ?? null;\n}\n`,
	);
	writeCurrentSnapshot(projectDir);

	const localBinDir = path.join(projectDir, "node_modules", ".bin");
	fs.mkdirSync(localBinDir, { recursive: true });
	fs.symlinkSync(repoTtsxPath, path.join(localBinDir, "ttsx"));
}

export function createTypeCoercionProject(projectDir: string) {
	createProjectShell(projectDir);

	writeFile(
		path.join(projectDir, "src", "save.tsx"),
		`export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.clickCount ?? null;\n}\n`,
	);
	writeFile(
		path.join(projectDir, "src", "validators.ts"),
		`export const validators = {\n\tvalidate(input: Record<string, unknown>) {\n\t\tconst success = typeof input.clickCount === "number";\n\t\treturn success\n\t\t\t? { success: true as const, data: input }\n\t\t\t: { success: false as const, errors: [{ path: "$", expected: "CoercionAttributes" }] };\n\t},\n\trandom() {\n\t\treturn { clickCount: 1 };\n\t},\n};\n`,
	);
	writeFile(
		path.join(projectDir, "src", "migrations", "config.ts"),
		`export const migrationConfig = {\n\tblockName: "create-block/coercion-smoke",\n\tcurrentMigrationVersion: "v3",\n\tsupportedMigrationVersions: ["v1", "v3"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`,
	);
	writeFile(
		path.join(projectDir, "src", "migrations", "helpers.ts"),
		HELPERS_SOURCE,
	);
	writeJson(path.join(projectDir, "block.json"), {
		apiVersion: 3,
		attributes: {
			clickCount: { type: "number" },
		},
		name: "create-block/coercion-smoke",
		title: "Coercion Smoke",
	});
	writeJson(path.join(projectDir, "typia.manifest.json"), {
		attributes: {
			clickCount: createManifestAttribute("number", {
				required: true,
			}),
		},
		manifestVersion: 2,
		sourceType: "CoercionAttributes",
	});
	writeJson(path.join(projectDir, "src", "migrations", "versions", "v1", "block.json"), {
		apiVersion: 3,
		attributes: {
			clickCount: { type: "string" },
		},
		name: "create-block/coercion-smoke",
		title: "Coercion Smoke",
	});
	writeJson(path.join(projectDir, "src", "migrations", "versions", "v1", "typia.manifest.json"), {
		attributes: {
			clickCount: createManifestAttribute("string", {
				required: true,
			}),
		},
		manifestVersion: 2,
		sourceType: "CoercionAttributes",
	});
	writeFile(
		path.join(projectDir, "src", "migrations", "versions", "v1", "save.tsx"),
		`export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.clickCount ?? null;\n}\n`,
	);
	writeCurrentSnapshot(projectDir);

	const localBinDir = path.join(projectDir, "node_modules", ".bin");
	fs.mkdirSync(localBinDir, { recursive: true });
	fs.symlinkSync(repoTtsxPath, path.join(localBinDir, "ttsx"));
}

export function createUnionProject(projectDir: string, { removeBranch = false }: { removeBranch?: boolean } = {}) {
	createProjectShell(projectDir);

	writeFile(
		path.join(projectDir, "src", "save.tsx"),
		`export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.linkTarget ?? null;\n}\n`,
	);
	writeFile(
		path.join(projectDir, "src", "validators.ts"),
		`export const validators = {\n\tvalidate(input: Record<string, unknown>) {\n\t\tconst target = input.linkTarget as any;\n\t\tconst success = typeof target === "object" && target !== null && typeof target.kind === "string";\n\t\treturn success\n\t\t\t? { success: true as const, data: input }\n\t\t\t: { success: false as const, errors: [{ path: "$", expected: "UnionAttributes" }] };\n\t},\n\trandom() {\n\t\treturn { linkTarget: { kind: "post", postId: 1 } };\n\t},\n};\n`,
	);
	writeFile(
		path.join(projectDir, "src", "migrations", "config.ts"),
		`export const migrationConfig = {\n\tblockName: "create-block/union-smoke",\n\tcurrentMigrationVersion: "v3",\n\tsupportedMigrationVersions: ["v1", "v3"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`,
	);
	writeFile(
		path.join(projectDir, "src", "migrations", "helpers.ts"),
		HELPERS_SOURCE,
	);

	const currentBranches: Record<string, ManifestAttribute> = removeBranch
		? {
			post: createObjectBranchManifestAttribute("kind", "post", {
				postId: createManifestAttribute("number", {
					required: true,
				}),
			}),
		}
		: {
			post: createObjectBranchManifestAttribute("kind", "post", {
				postId: createManifestAttribute("number", {
					required: true,
				}),
			}),
			url: createObjectBranchManifestAttribute("kind", "url", {
				href: createManifestAttribute("string", {
					required: true,
				}),
			}),
		};
	const legacyBranches: Record<string, ManifestAttribute> = removeBranch
		? {
			post: createObjectBranchManifestAttribute("kind", "post", {
				postId: createManifestAttribute("number", {
					required: true,
				}),
			}),
			url: createObjectBranchManifestAttribute("kind", "url", {
				href: createManifestAttribute("string", {
					required: true,
				}),
			}),
		}
		: {
			post: createObjectBranchManifestAttribute("kind", "post", {
				postId: createManifestAttribute("number", {
					required: true,
				}),
			}),
		};

	writeJson(path.join(projectDir, "block.json"), {
		apiVersion: 3,
		attributes: {
			linkTarget: { type: "object" },
		},
		name: "create-block/union-smoke",
		title: "Union Smoke",
	});
	writeJson(path.join(projectDir, "typia.manifest.json"), {
		attributes: {
			linkTarget: createUnionManifestAttribute("kind", currentBranches),
		},
		manifestVersion: 2,
		sourceType: "UnionAttributes",
	});
	writeJson(path.join(projectDir, "src", "migrations", "versions", "v1", "block.json"), {
		apiVersion: 3,
		attributes: {
			linkTarget: { type: "object" },
		},
		name: "create-block/union-smoke",
		title: "Union Smoke",
	});
	writeJson(path.join(projectDir, "src", "migrations", "versions", "v1", "typia.manifest.json"), {
		attributes: {
			linkTarget: createUnionManifestAttribute("kind", legacyBranches),
		},
		manifestVersion: 2,
		sourceType: "UnionAttributes",
	});
	writeFile(
		path.join(projectDir, "src", "migrations", "versions", "v1", "save.tsx"),
		`export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.linkTarget ?? null;\n}\n`,
	);
	writeCurrentSnapshot(projectDir);

	const localBinDir = path.join(projectDir, "node_modules", ".bin");
	fs.mkdirSync(localBinDir, { recursive: true });
	fs.symlinkSync(repoTtsxPath, path.join(localBinDir, "ttsx"));
}

export function createFuzzFailureProject(projectDir: string) {
	createProjectShell(projectDir);

	writeFile(
		path.join(projectDir, "src", "validators.ts"),
		`export const validators = {\n\tvalidate(input: Record<string, unknown>) {\n\t\tconst success = input.content === "Hello";\n\t\treturn success\n\t\t\t? { success: true as const, data: input }\n\t\t\t: { success: false as const, errors: [{ path: "$.content", expected: '"Hello"' }] };\n\t},\n\trandom() {\n\t\treturn { content: "legacy-random" };\n\t},\n};\n`,
	);
	writeFile(
		path.join(projectDir, "src", "migrations", "config.ts"),
		`export const migrationConfig = {\n\tblockName: "create-block/fuzz-failure",\n\tcurrentMigrationVersion: "v3",\n\tsupportedMigrationVersions: ["v1", "v3"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`,
	);
	writeFile(
		path.join(projectDir, "src", "migrations", "helpers.ts"),
		HELPERS_SOURCE,
	);
	writeJson(path.join(projectDir, "block.json"), {
		apiVersion: 3,
		attributes: {
			content: { default: "Hello", type: "string" },
		},
		name: "create-block/fuzz-failure",
		title: "Fuzz Failure",
	});
	writeJson(path.join(projectDir, "typia.manifest.json"), {
		attributes: {
			content: createManifestAttribute("string", {
				defaultValue: "Hello",
				required: true,
			}),
		},
		manifestVersion: 2,
		sourceType: "FuzzFailureAttributes",
	});
	writeJson(path.join(projectDir, "src", "migrations", "versions", "v1", "block.json"), {
		apiVersion: 3,
		attributes: {
			content: { default: "Hello", type: "string" },
		},
		name: "create-block/fuzz-failure",
		title: "Fuzz Failure",
	});
	writeJson(path.join(projectDir, "src", "migrations", "versions", "v1", "typia.manifest.json"), {
		attributes: {
			content: createManifestAttribute("string", {
				defaultValue: "Hello",
				required: true,
			}),
		},
		manifestVersion: 2,
		sourceType: "FuzzFailureAttributes",
	});
	writeFile(
		path.join(projectDir, "src", "migrations", "versions", "v1", "save.tsx"),
		`export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.content ?? null;\n}\n`,
	);
	writeCurrentSnapshot(projectDir);

	const localBinDir = path.join(projectDir, "node_modules", ".bin");
	fs.mkdirSync(localBinDir, { recursive: true });
	fs.symlinkSync(repoTtsxPath, path.join(localBinDir, "ttsx"));
}
