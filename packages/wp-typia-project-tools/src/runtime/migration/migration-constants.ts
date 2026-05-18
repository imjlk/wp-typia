import path from "node:path";

export const ROOT_BLOCK_JSON = "block.json";
export const ROOT_MANIFEST = "typia.manifest.json";
export const ROOT_PHP_MIGRATION_REGISTRY = "typia-migration-registry.php";
export const SRC_BLOCK_JSON = path.join("src", "block.json");
export const SRC_MANIFEST = path.join("src", "typia.manifest.json");
export const ROOT_SAVE_FILE = path.join("src", "save.tsx");
export const ROOT_TYPES_FILE = path.join("src", "types.ts");
export const MIGRATIONS_DIR = path.join("src", "migrations");
export const CONFIG_FILE = path.join(MIGRATIONS_DIR, "config.ts");
export const GENERATED_DIR = path.join(MIGRATIONS_DIR, "generated");
export const FIXTURES_DIR = path.join(MIGRATIONS_DIR, "fixtures");
export const RULES_DIR = path.join(MIGRATIONS_DIR, "rules");
export const SNAPSHOT_DIR = path.join(MIGRATIONS_DIR, "versions");
export const SUPPORTED_PROJECT_FILES = ["package.json", ROOT_BLOCK_JSON, ROOT_SAVE_FILE, ROOT_TYPES_FILE];
export const MIGRATION_TODO_PREFIX = "TODO MIGRATION:";
