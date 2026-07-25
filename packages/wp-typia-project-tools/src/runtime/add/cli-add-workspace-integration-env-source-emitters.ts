import type { IntegrationEnvServiceId } from "./cli-add-shared.js";
import { toTitleCase } from "../shared/string-case.js";

/**
 * Render the default `@wordpress/env` configuration for an integration
 * environment starter.
 *
 * @returns JSON source for `.wp-env.json`.
 */
export function buildWpEnvConfigSource(): string {
	return `${JSON.stringify(
		{
			$schema: "https://schemas.wp.org/trunk/wp-env.json",
			core: null,
			port: 8888,
			testsEnvironment: false,
			plugins: ["."],
			config: {
				WP_DEBUG: true,
				WP_DEBUG_LOG: true,
				WP_DEBUG_DISPLAY: false,
				SCRIPT_DEBUG: true,
				WP_ENVIRONMENT_TYPE: "local",
			},
		},
		null,
		2,
	)}\n`;
}

/**
 * Render the placeholder docker-compose service used by the integration starter.
 *
 * @returns YAML source for `docker-compose.integration.yml`.
 */
export function buildDockerComposeSource(): string {
	return `services:
  integration-service:
    image: node:22-alpine
    working_dir: /workspace
    volumes:
      - .:/workspace
    command: >
      node -e "require('node:http').createServer((request, response) => {
        response.writeHead(request.url === '/health' ? 200 : 404, {
          'content-type': 'application/json'
        });
        response.end(JSON.stringify({
          ok: request.url === '/health',
          service: 'wp-typia-integration-starter'
        }));
      }).listen(3000, '0.0.0.0')"
    ports:
      - "3000:3000"
`;
}

/**
 * Render the editable Node smoke-test starter for a workspace.
 *
 * @param integrationEnvSlug Normalized integration environment slug.
 * @returns JavaScript module source for the generated smoke runner.
 */
export function buildIntegrationSmokeScriptSource(
	integrationEnvSlug: string,
): string {
	return `import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(
	fileURLToPath(new URL("../..", import.meta.url)),
);
const ENV_FILE = path.join(ROOT_DIR, ".env");

function parseEnvValue(value) {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}

	return trimmed;
}

function readEnvFile(filePath) {
	if (!fs.existsSync(filePath)) {
		return {};
	}

	return Object.fromEntries(
		fs
			.readFileSync(filePath, "utf8")
			.split(/\\r?\\n/u)
			.map((line) => line.trim())
			.filter((line) => line.length > 0 && !line.startsWith("#"))
			.map((line) => {
				const separatorIndex = line.indexOf("=");
				if (separatorIndex === -1) {
					return null;
				}

				return [
					line.slice(0, separatorIndex).trim(),
					parseEnvValue(line.slice(separatorIndex + 1)),
				];
			})
			.filter(Boolean),
	);
}

const envFile = readEnvFile(ENV_FILE);

function getEnv(name, fallback) {
	return process.env[name] ?? envFile[name] ?? fallback;
}

function getPositiveIntegerEnv(name, fallback) {
	const value = Number.parseInt(getEnv(name, String(fallback)), 10);
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

function resolveEndpointUrl(baseUrl, endpointPath) {
	const normalizedBaseUrl = new URL(baseUrl);
	if (!normalizedBaseUrl.pathname.endsWith("/")) {
		normalizedBaseUrl.pathname = \`\${normalizedBaseUrl.pathname}/\`;
	}

	const relativePath = endpointPath.replace(/^\\/+/u, "");
	return new URL(relativePath, normalizedBaseUrl);
}

async function assertJsonEndpoint(label, url) {
	const requestTimeoutMs = getPositiveIntegerEnv(
		"WP_TYPIA_SMOKE_TIMEOUT_MS",
		30_000,
	);
	const response = await fetch(url, {
		headers: {
			accept: "application/json",
		},
		signal: AbortSignal.timeout(requestTimeoutMs),
	});

	if (!response.ok) {
		throw new Error(
			\`\${label} failed at \${url} with HTTP \${response.status}.\`,
		);
	}

	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		throw new Error(
			\`\${label} at \${url} did not return JSON (content-type: \${contentType || "missing"}).\`,
		);
	}

	return response.json();
}

const baseUrl = new URL(
	getEnv("WP_TYPIA_SMOKE_BASE_URL", "http://localhost:8888"),
);
const serviceUrl = getEnv("WP_TYPIA_SERVICE_URL", "").trim();

// Extend this starter with project-specific generated REST clients or schema
// checks as the workspace grows. For example, read JSON schemas under
// src/rest/<resource>/api-schemas or import TS clients through a ttsx-powered
// smoke runner when you need authenticated route coverage.

await assertJsonEndpoint(
	"WordPress REST index",
	resolveEndpointUrl(baseUrl, "wp-json/"),
);

if (serviceUrl.length > 0) {
	await assertJsonEndpoint(
		"Local integration service healthcheck",
		resolveEndpointUrl(serviceUrl, "health"),
	);
}

console.log("wp-typia integration smoke passed: ${integrationEnvSlug}");
`;
}

/**
 * Render safe default environment variables for integration smoke checks.
 *
 * @param service Selected optional local service starter.
 * @returns Source for entries appended to `.env.example`.
 */
export function buildEnvExampleSource(service: IntegrationEnvServiceId): string {
	return [
		"# wp-typia integration smoke settings",
		"WP_TYPIA_SMOKE_BASE_URL=http://localhost:8888",
		"WP_TYPIA_SMOKE_USERNAME=admin",
		"WP_TYPIA_SMOKE_PASSWORD=password",
		"WP_TYPIA_SMOKE_TIMEOUT_MS=30000",
		...(service === "docker-compose"
			? [
					"",
					"# Optional docker-compose integration service starter.",
					"WP_TYPIA_SERVICE_URL=http://localhost:3000",
			  ]
			: [
					"",
					"# Set this when your smoke test needs a project-specific service.",
					"# WP_TYPIA_SERVICE_URL=http://localhost:3000",
			  ]),
		"",
	].join("\n");
}

/**
 * Render integration environment onboarding documentation.
 *
 * @param options Integration environment documentation options.
 * @param options.integrationEnvSlug Normalized integration environment slug.
 * @param options.service Selected optional local service starter.
 * @param options.withReleaseZip Whether release zip scripts were scaffolded.
 * @param options.withWpEnv Whether wp-env setup was scaffolded.
 * @returns Markdown source for the generated integration environment guide.
 */
export function buildIntegrationEnvReadmeSource({
	integrationEnvSlug,
	service,
	withReleaseZip,
	withWpEnv,
}: {
	integrationEnvSlug: string;
	service: IntegrationEnvServiceId;
	withReleaseZip: boolean;
	withWpEnv: boolean;
}): string {
	const title = toTitleCase(integrationEnvSlug);
	const setupSteps = [
		"Copy `.env.example` to `.env` and adjust the URLs or credentials for your local project.",
		...(withWpEnv
			? [
					"Run `npm run wp-env:start` to start the generated WordPress environment.",
			  ]
			: [
					"Point `WP_TYPIA_SMOKE_BASE_URL` at the WordPress environment you already run locally.",
			  ]),
		...(service === "docker-compose"
			? [
					"Run `npm run service:start` if you want the placeholder docker-compose service available at `WP_TYPIA_SERVICE_URL`.",
			  ]
			: [
					"Set `WP_TYPIA_SERVICE_URL` only when your integration smoke needs a local service dependency.",
			  ]),
		`Run \`npm run smoke:${integrationEnvSlug}\` to execute the starter smoke check.`,
		...(withReleaseZip
			? [
					"Run `npm run release:zip` after smoke checks pass to build a distributable plugin zip.",
			  ]
			: []),
	];

	return `# ${title} Integration Environment

This starter keeps local WordPress integration smoke checks opt-in and editable.
It does not change default block scaffolds or require wp-env unless this add
workflow was run with \`--wp-env\`.

## Setup

${setupSteps.map((step, index) => `${index + 1}. ${step}`).join("\n")}

## Adapting the Starter

- Extend \`scripts/integration-smoke/${integrationEnvSlug}.mjs\` with the REST,
  editor, or service assertions that matter for this project.
- Keep secrets in \`.env\`; \`.env.example\` should document only safe defaults.
- If your project uses a real service stack, replace the placeholder
  \`docker-compose.integration.yml\` service with your database, queue, API, or
  emulator containers.
- Keep the smoke script focused on high-signal integration checks so CI and
  local debugging stay fast.
${withReleaseZip ? "- Treat `release:zip:check` as a CI guard before packaging release artifacts.\n" : ""}
`;
}
