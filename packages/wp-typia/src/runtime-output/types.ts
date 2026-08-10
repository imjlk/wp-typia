import type { PackageManagerId } from '@wp-typia/project-tools/package-managers';

export type CreateProgressPayload = {
  detail: string;
  title: string;
};

export type RuntimeCompletionPayload = {
  nextSteps?: string[];
  optionalLines?: string[];
  optionalNote?: string;
  optionalTitle?: string;
  preambleLines?: string[];
  summaryLines?: string[];
  title: string;
  warningLines?: string[];
};

export type StructuredCompletionSuccessPayload = {
  ok: true;
  data: {
    command: string;
    completion?: SerializableCompletionPayload;
    files?: string[];
  } & Record<string, unknown>;
};

export type InitPlanLayoutKind =
  | 'generated-project'
  | 'multi-block'
  | 'official-workspace'
  | 'single-block'
  | 'unsupported';

export type StructuredInitPlan = {
  commandMode: 'apply' | 'preview-only';
  detectedLayout: {
    blockNames: string[];
    description: string;
    kind: InitPlanLayoutKind;
  };
  generatedArtifacts: string[];
  nextSteps: string[];
  notes: string[];
  packageChanges: {
    addDevDependencies: Array<{
      action: 'add' | 'update';
      name: string;
      requiredValue: string;
    }>;
    packageManagerField?: {
      action: 'add' | 'update';
      requiredValue: string;
    };
    scripts: Array<
      | {
          action: 'add' | 'update';
          name: string;
          requiredValue: string;
        }
      | {
          action: 'remove';
          currentValue: string;
          name: string;
        }
    >;
  };
  plannedFiles: Array<{
    action: 'add' | 'update';
    path: string;
    purpose: string;
  }>;
  packageManager: PackageManagerId;
  projectDir: string;
  projectName: string;
  status: 'already-initialized' | 'applied' | 'preview';
  summary: string;
};

export type StructuredInitSuccessPayload = {
  ok: true;
  data: {
    command: 'init';
    completion: SerializableCompletionPayload;
    detectedLayout: StructuredInitPlan['detectedLayout'];
    files?: string[];
    mode: 'apply' | 'preview';
    packageManager: PackageManagerId;
    plan: StructuredInitPlan;
    projectDir: string;
    status: StructuredInitPlan['status'];
    summary: string;
  };
};

export type SerializableCompletionPayload = {
  nextSteps?: string[];
  optionalLines?: string[];
  optionalNote?: string;
  optionalTitle?: string;
  preambleLines?: string[];
  summaryLines?: string[];
  title: string;
  warningLines?: string[];
};
