export const ALTERNATE_RENDER_TARGET_IDS = [
	"email",
	"mjml",
	"plain-text",
] as const;

export type AlternateRenderTargetId =
	(typeof ALTERNATE_RENDER_TARGET_IDS)[number];

export function isAlternateRenderTargetId(
	value: string,
): value is AlternateRenderTargetId {
	return (ALTERNATE_RENDER_TARGET_IDS as readonly string[]).includes(value);
}

export function parseAlternateRenderTargets(
	value?: string,
): AlternateRenderTargetId[] {
	if (typeof value !== "string") {
		return [];
	}

	const normalized = value
		.split(",")
		.map((entry) => entry.trim().toLowerCase())
		.filter(Boolean);

	if (normalized.length === 0) {
		return [];
	}

	const deduped = Array.from(new Set(normalized));
	const invalid = deduped.filter((entry) => !isAlternateRenderTargetId(entry));
	if (invalid.length > 0) {
		throw new Error(
			`Unsupported alternate render target${invalid.length > 1 ? "s" : ""} "${invalid.join(", ")}". Expected one of: ${ALTERNATE_RENDER_TARGET_IDS.join(", ")}.`,
		);
	}

	return deduped as AlternateRenderTargetId[];
}

export function formatAlternateRenderTargets(
	targets: readonly AlternateRenderTargetId[],
): string {
	return targets.join(", ");
}
