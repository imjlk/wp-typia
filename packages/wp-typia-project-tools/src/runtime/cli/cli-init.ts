import { applyInitPlan as applyInitPlanImpl } from "./cli-init-apply.js";
import { getInitPlan as getInitPlanImpl } from "./cli-init-plan.js";
import type { RetrofitInitPlan } from "./cli-init-types.js";

export { applyInitPlan } from "./cli-init-apply.js";
export { getInitPlan } from "./cli-init-plan.js";
export type {
	InitCommandMode,
	InitDependencyChange,
	InitFilePlan,
	InitPackageManagerFieldChange,
	InitPlanAction,
	InitPlanLayoutKind,
	InitPlanStatus,
	InitScriptChange,
	RetrofitInitBlockTarget,
	RetrofitInitPlan,
} from "./cli-init-types.js";

/**
 * Execute `wp-typia init` in preview or apply mode.
 *
 * @param options Resolved command options including the target project
 * directory, optional package-manager override, and whether writes should be
 * applied.
 * @returns The previewed or applied retrofit init plan.
 */
export async function runInitCommand(options: {
	apply?: boolean;
	packageManager?: string;
	projectDir: string;
}): Promise<RetrofitInitPlan> {
	return options.apply
		? applyInitPlanImpl(options.projectDir, {
				packageManager: options.packageManager,
		  })
		: getInitPlanImpl(options.projectDir, {
				packageManager: options.packageManager,
		  });
}
