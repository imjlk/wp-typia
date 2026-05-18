export interface SuggestCloseIdOptions {
	/**
	 * Maximum edit distance accepted for a suggestion.
	 *
	 * Defaults to `2`, matching the create-template typo guard.
	 */
	maxDistance?: number;
	/**
	 * Normalizes user input and candidates before comparing them.
	 *
	 * Defaults to trimming and lowercasing for CLI id-like values.
	 */
	normalize?: (value: string) => string;
}

function normalizeCloseId(value: string): string {
	return value.trim().toLowerCase();
}

function getEditDistance(left: string, right: string): number {
	const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
	const current = new Array<number>(right.length + 1);

	for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
		current[0] = leftIndex + 1;

		for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
			const substitutionCost = left[leftIndex] === right[rightIndex] ? 0 : 1;
			current[rightIndex + 1] = Math.min(
				current[rightIndex] + 1,
				previous[rightIndex + 1] + 1,
				previous[rightIndex] + substitutionCost,
			);
		}

		for (let index = 0; index < current.length; index += 1) {
			previous[index] = current[index] as number;
		}
	}

	return previous[right.length] as number;
}

/**
 * Suggest the closest known id for a user-provided CLI value.
 *
 * This helper is intentionally generic so command-specific validation can keep
 * its own wording and special-case handling while sharing typo thresholds.
 */
export function suggestCloseId<const TCandidate extends string>(
	input: string,
	candidates: readonly TCandidate[],
	options: SuggestCloseIdOptions = {},
): TCandidate | null {
	const normalize = options.normalize ?? normalizeCloseId;
	const normalizedInput = normalize(input);
	if (normalizedInput.length === 0) {
		return null;
	}

	const maxDistance = options.maxDistance ?? 2;
	if (maxDistance < 0) {
		return null;
	}

	let bestCandidate: { distance: number; id: TCandidate } | null = null;

	for (const candidateId of candidates) {
		const distance = getEditDistance(normalizedInput, normalize(candidateId));
		if (bestCandidate === null || distance < bestCandidate.distance) {
			bestCandidate = {
				distance,
				id: candidateId,
			};
		}
	}

	return bestCandidate && bestCandidate.distance <= maxDistance
		? bestCandidate.id
		: null;
}
