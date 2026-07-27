import fs from "node:fs";
import path from "node:path";

import {
  hasPhpBinary,
  run,
} from "./generated-project-smoke-core.mjs";

const EDITOR_PLUGIN_SMOKE_SLOT_ALIASES = new Map([
	["PluginDocumentSettingPanel", "document-setting-panel"],
	["PluginSidebar", "sidebar"],
	["document-setting-panel", "document-setting-panel"],
	["sidebar", "sidebar"],
]);

function normalizeEditorPluginSmokeSlot(slot = "sidebar") {
	return EDITOR_PLUGIN_SMOKE_SLOT_ALIASES.get(slot) ?? slot;
}

function lintPhpArtifact(filePath) {
  if (!hasPhpBinary()) {
    return;
  }

  run("php", ["-l", filePath], {
    stdio: "ignore",
  });
}

export function assertWorkspaceTemplateScaffold(projectDir) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));

  if (packageJson.wpTypia?.projectType !== "workspace") {
    throw new Error("Expected generated workspace package.json to include wpTypia.projectType = workspace");
  }
  if (
    packageJson.wpTypia?.templatePackage !== "@wp-typia/create-workspace-template"
  ) {
    throw new Error("Expected generated workspace package.json to record the official workspace template package");
  }
  if (!fs.existsSync(path.join(projectDir, "scripts", "build-workspace.mjs"))) {
    throw new Error("Expected official workspace template to include scripts/build-workspace.mjs");
  }
}

export function isWorkspaceTemplateRequest(template, packageJson) {
  return (
    template === "workspace" ||
    template === "@wp-typia/create-workspace-template" ||
    packageJson.wpTypia?.projectType === "workspace"
  );
}

export function assertWorkspaceBlockArtifacts(projectDir, blockSlugs) {
  for (const slug of blockSlugs) {
    const blockDir = path.join(projectDir, "build", "blocks", slug);
    if (!fs.existsSync(path.join(blockDir, "block.json"))) {
      throw new Error(`Expected workspace build to include ${slug}/block.json`);
    }
    if (!fs.existsSync(path.join(blockDir, "typia.manifest.json"))) {
      throw new Error(`Expected workspace build to include ${slug}/typia.manifest.json`);
    }
    if (!fs.existsSync(path.join(blockDir, "typia-validator.php"))) {
      throw new Error(`Expected workspace build to include ${slug}/typia-validator.php`);
    }
  }

  if (!fs.existsSync(path.join(projectDir, "build", "blocks-manifest.php"))) {
    throw new Error("Expected workspace build to include blocks-manifest.php");
  }
}

export function assertWorkspaceVariationArtifacts(projectDir, blockSlug, variationSlug) {
  const variationPath = path.join(
    projectDir,
    "src",
    "blocks",
    blockSlug,
    "variations",
    `${variationSlug}.ts`,
  );
  if (!fs.existsSync(variationPath)) {
    throw new Error(`Expected workspace variation to exist at ${variationPath}`);
  }
}

export function assertWorkspacePatternArtifacts(projectDir, patternSlug) {
  const patternPath = path.join(projectDir, "src", "patterns", "full", `${patternSlug}.php`);
  if (!fs.existsSync(patternPath)) {
    throw new Error(`Expected workspace pattern to exist at ${patternPath}`);
  }

  lintPhpArtifact(patternPath);
}

export function assertWorkspaceBindingSourceArtifacts(projectDir, bindingSourceSlug) {
  const bindingSourceDir = path.join(projectDir, "src", "bindings", bindingSourceSlug);
  const serverPath = path.join(bindingSourceDir, "server.php");
  const editorPath = path.join(bindingSourceDir, "editor.ts");

  if (!fs.existsSync(serverPath)) {
    throw new Error(`Expected workspace binding source server file at ${serverPath}`);
  }
  if (!fs.existsSync(editorPath)) {
    throw new Error(`Expected workspace binding source editor file at ${editorPath}`);
  }
  if (!fs.existsSync(path.join(projectDir, "build", "bindings", "index.js"))) {
    throw new Error("Expected workspace build to include build/bindings/index.js");
  }
  if (!fs.existsSync(path.join(projectDir, "build", "bindings", "index.asset.php"))) {
    throw new Error("Expected workspace build to include build/bindings/index.asset.php");
  }

	lintPhpArtifact(serverPath);
}

export function assertWorkspaceEditorPluginArtifacts(
	projectDir,
	editorPluginSlug,
	slot,
) {
	const normalizedSlot = normalizeEditorPluginSmokeSlot(slot);
	const editorPluginDir = path.join(
		projectDir,
		"src",
		"editor-plugins",
		editorPluginSlug,
	);
	const entryPath = path.join(editorPluginDir, "index.tsx");
	const surfacePath = path.join(editorPluginDir, "Surface.tsx");
	const dataPath = path.join(editorPluginDir, "data.ts");
	const typesPath = path.join(editorPluginDir, "types.ts");
	const stylePath = path.join(editorPluginDir, "style.scss");

	for (const filePath of [entryPath, surfacePath, dataPath, typesPath, stylePath]) {
		if (!fs.existsSync(filePath)) {
			throw new Error(`Expected workspace editor plugin file at ${filePath}`);
		}
	}

	if (
		!fs.existsSync(path.join(projectDir, "build", "editor-plugins", "index.js"))
	) {
		throw new Error(
			"Expected workspace build to include build/editor-plugins/index.js",
		);
	}
	if (
		!fs.existsSync(path.join(projectDir, "build", "editor-plugins", "index.asset.php"))
	) {
		throw new Error(
			"Expected workspace build to include build/editor-plugins/index.asset.php",
		);
	}
	if (
		!fs.existsSync(path.join(projectDir, "build", "editor-plugins", "style-index.css"))
	) {
		throw new Error(
			"Expected workspace build to include build/editor-plugins/style-index.css",
		);
	}

	const dataSource = fs.readFileSync(dataPath, "utf8");
	const surfaceSource = fs.readFileSync(surfacePath, "utf8");
	if (!dataSource.includes(`EDITOR_PLUGIN_SLOT = '${normalizedSlot}'`)) {
		throw new Error(
			`Expected ${dataPath} to pin the ${normalizedSlot} editor plugin slot.`,
		);
	}
	if (
		normalizedSlot === "document-setting-panel" &&
		!surfaceSource.includes("PluginDocumentSettingPanel")
	) {
		throw new Error(
			`Expected ${surfacePath} to render PluginDocumentSettingPanel for document-setting-panel.`,
		);
	}
	if (
		normalizedSlot === "sidebar" &&
		!surfaceSource.includes("PluginSidebarMoreMenuItem")
	) {
		throw new Error(
			`Expected ${surfacePath} to render PluginSidebarMoreMenuItem for sidebar.`,
		);
	}
}

export function assertWorkspaceHookedBlockArtifacts(projectDir, blockSlug, anchorBlockName, position) {
  const blockJsonPath = path.join(projectDir, "src", "blocks", blockSlug, "block.json");
  if (!fs.existsSync(blockJsonPath)) {
    throw new Error(`Expected hooked workspace block metadata at ${blockJsonPath}`);
  }

  const blockJson = JSON.parse(fs.readFileSync(blockJsonPath, "utf8"));
  if (blockJson.blockHooks?.[anchorBlockName] !== position) {
    throw new Error(
      `Expected ${blockJsonPath} to define blockHooks.${anchorBlockName} = ${position}`,
    );
  }
}
