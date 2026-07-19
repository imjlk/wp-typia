import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	detectJsonIndent,
	readJsonFile,
	readJsonFileSync,
	safeJsonParse,
} from "../src/runtime/json-utils.js";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wp-typia-json-utils-"));

afterAll(() => {
	fs.rmSync(tempRoot, { force: true, recursive: true });
});

function getThrownMessage(callback: () => void): string {
	try {
		callback();
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}

	throw new Error("Expected callback to throw.");
}

async function getRejectedMessage(callback: () => Promise<void>): Promise<string> {
	try {
		await callback();
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}

	throw new Error("Expected callback to reject.");
}

describe("project-tools JSON helpers", () => {
	test("detects formatted JSON indentation with a compact fallback", () => {
		expect(detectJsonIndent('{\n\t"ok": true\n}\n')).toBe("\t");
		expect(detectJsonIndent('{\r\n    "ok": true\r\n}\r\n')).toBe("    ");
		expect(detectJsonIndent('{"ok":true}')).toBe(2);
	});

	test("preserves valid JSON return values", () => {
		expect(
			safeJsonParse<{ ok: boolean }>('{"ok":true}', {
				context: "inline config",
			}),
		).toEqual({ ok: true });
	});

	test("adds context and file path to malformed source errors", () => {
		const filePath = path.join(tempRoot, "inline-bad.json");
		const message = getThrownMessage(() => {
			safeJsonParse("{", {
				context: "workspace package manifest",
				filePath,
			});
		});

		expect(message).toContain(
			`Failed to parse workspace package manifest at ${filePath}:`,
		);
	});

	test("adds context and file path to malformed sync file reader errors", () => {
		const filePath = path.join(tempRoot, "sync-bad.json");
		fs.writeFileSync(filePath, "{", "utf8");

		const message = getThrownMessage(() => {
			readJsonFileSync(filePath, {
				context: "bad fixture",
			});
		});

		expect(message).toContain(`Failed to parse bad fixture at ${filePath}:`);
	});

	test("adds context and file path to malformed async file reader errors", async () => {
		const filePath = path.join(tempRoot, "async-bad.json");
		fs.writeFileSync(filePath, "{", "utf8");

		const message = await getRejectedMessage(async () => {
			await readJsonFile(filePath, {
				context: "async fixture",
			});
		});

		expect(message).toContain(`Failed to parse async fixture at ${filePath}:`);
	});
});
