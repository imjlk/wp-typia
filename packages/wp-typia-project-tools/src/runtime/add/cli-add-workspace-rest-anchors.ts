/**
 * Compatibility facade for REST workspace anchor patchers.
 *
 * Keep the public runtime import path stable while bootstrap, contract sync,
 * and REST resource sync patchers live in focused implementation modules.
 */
export {
	ensureRestResourceBootstrapAnchors,
	ensureRestSchemaHelperBootstrapAnchors,
} from "./cli-add-workspace-rest-bootstrap-anchors.js";
export {
	ensureContractSyncScriptAnchors,
} from "./cli-add-workspace-rest-contract-sync-anchors.js";
export {
	ensureRestResourceSyncScriptAnchors,
} from "./cli-add-workspace-rest-resource-sync-anchors.js";
