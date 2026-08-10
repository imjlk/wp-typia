import type { PackageManagerId } from '../shared/package-managers.js';
import type { WorkspacePackageJson } from '../workspace/workspace-project.js';

export type InitCommandMode = 'apply' | 'preview-only';
export type InitPlanAction = 'add' | 'update';
export type InitPlanStatus = 'already-initialized' | 'applied' | 'preview';
export type InitPlanLayoutKind =
	| 'generated-project'
	| 'multi-block'
	| 'official-workspace'
	| 'single-block'
	| 'unsupported';

export interface InitDependencyChange {
  action: InitPlanAction;
  currentValue?: string;
  name: string;
  requiredValue: string;
}

export type InitScriptChange =
  | {
      action: InitPlanAction;
      currentValue?: string;
      name: string;
      requiredValue: string;
    }
  | {
      action: 'remove';
      currentValue: string;
      name: string;
      requiredValue?: never;
    };

export interface InitPackageManagerFieldChange {
  action: InitPlanAction;
  currentValue?: string;
  requiredValue: string;
}

export interface InitFilePlan {
  action: InitPlanAction;
  path: string;
  purpose: string;
}

/**
 * One existing block target that `wp-typia init` can retrofit into the shared
 * sync surface.
 *
 * Each path stays relative to the project root so generated helper scripts can
 * resolve the current block metadata and TypeScript source of truth without
 * guessing layout-specific locations.
 */
export interface RetrofitInitBlockTarget {
  attributeTypeName: string;
  blockJsonFile: string;
  blockName: string;
  manifestFile: string;
  saveFile: string;
  slug: string;
  typesFile: string;
}

/**
 * Preview or apply result returned by `wp-typia init`.
 *
 * The plan describes the detected retrofit layout, package-level mutations,
 * helper files, next steps, and any warnings gathered while preparing or
 * applying the minimum sync surface for an existing project.
 */
export interface RetrofitInitPlan {
  blockTargets: RetrofitInitBlockTarget[];
  commandMode: InitCommandMode;
  detectedLayout: {
    blockNames: string[];
    description: string;
    kind: InitPlanLayoutKind;
  };
  generatedArtifacts: string[];
  nextSteps: string[];
  notes: string[];
  packageChanges: {
    addDevDependencies: InitDependencyChange[];
    packageManagerField?: InitPackageManagerFieldChange;
    scripts: InitScriptChange[];
  };
  plannedFiles: InitFilePlan[];
  packageManager: PackageManagerId;
  projectDir: string;
  projectName: string;
  status: InitPlanStatus;
  summary: string;
}

export type ProjectPackageJson = WorkspacePackageJson & {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  private?: boolean;
  version?: string;
};

export const SUPPORTED_RETROFIT_LAYOUT_NOTE =
	'Supported retrofit layouts currently mirror the migration bootstrap detector: `src/block.json` + `src/types.ts` + `src/save.tsx`, legacy root `block.json` + `src/types.ts` + `src/save.tsx`, or multi-block `src/blocks/*/block.json` workspaces.';

export const RETROFIT_APPLY_PREVIEW_NOTE =
	'If you rerun with `wp-typia init --apply`, package.json, generated helper files, and any package-manager configuration updates are snapshotted and rolled back automatically if a write fails.';

export const RETROFIT_ROLLBACK_NOTE =
	'Apply mode writes package.json, generated helper files, and any package-manager configuration updates with rollback-on-failure protection.';
