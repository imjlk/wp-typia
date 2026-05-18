/**
 * Parse a dotted version floor into numeric parts for stable comparisons.
 *
 * @param value Human-authored version floor such as `7.0` or `8.1.2`.
 * @returns Numeric version segments suitable for ordered comparison.
 * @throws When any segment contains non-digit characters.
 */
export function parseVersionFloorParts(value: string): number[] {
  return value.split('.').map((part, index) => {
    if (!/^\d+$/u.test(part)) {
      throw new Error(
        `parseVersionFloorParts received an invalid version floor "${value}" at segment ${index + 1}.`,
      );
    }
    return Number.parseInt(part, 10);
  });
}

/**
 * Compare two dotted version floors.
 *
 * Missing trailing segments are treated as zero so `7.0` equals `7.0.0`.
 *
 * @param left Left-hand version floor.
 * @param right Right-hand version floor.
 * @returns `1` when left is higher, `-1` when right is higher, or `0` when equal.
 */
export function compareVersionFloors(left: string, right: string): number {
  const leftParts = parseVersionFloorParts(left);
  const rightParts = parseVersionFloorParts(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

/**
 * Pick the higher version floor while tolerating undefined values.
 *
 * @param current Current resolved floor, when present.
 * @param candidate Candidate floor to compare against the current floor.
 * @returns The higher defined floor, or undefined when neither value exists.
 */
export function pickHigherVersionFloor(
  current: string | undefined,
  candidate: string | undefined,
): string | undefined {
  if (current !== undefined) {
    parseVersionFloorParts(current);
  }
  if (candidate !== undefined) {
    parseVersionFloorParts(candidate);
  }

  if (candidate === undefined) {
    return current;
  }
  if (current === undefined) {
    return candidate;
  }

  return compareVersionFloors(current, candidate) >= 0 ? current : candidate;
}
