const SYNC_STACK_FRAME_PATTERN =
  /^\s*at\s+.*(?:\([^()\r\n]+:\d+:\d+\)|[^()\s]+:\d+:\d+)\s*$/u;
const SYNC_STACK_FRAME_LEADING_PREFIX_PATTERN =
  /^(?:[\t ]*|[\t ]*a|[\t ]*at|[\t ]*at[\t ]*)$/u;
// Node stack frames indent their `at` records. Once content follows an
// unindented `at `, stream it because it may be an interactive stderr prompt.
const INDENTED_SYNC_STACK_FRAME_CONTENT_PREFIX_PATTERN =
  /^[\t ]+at[\t ]+\S.*$/u;
const SANITIZED_SYNC_STACK_FRAME_PATTERN =
  /^\s*at\s+(?:.*\(<redacted-path>\)?|<redacted-path>)\s*$/u;

export function isSyncStackFrameLine(line: string): boolean {
  return (
    SYNC_STACK_FRAME_PATTERN.test(line) ||
    SANITIZED_SYNC_STACK_FRAME_PATTERN.test(line)
  );
}

export function isPossibleSyncStackFramePrefix(line: string): boolean {
  return (
    SYNC_STACK_FRAME_LEADING_PREFIX_PATTERN.test(line) ||
    INDENTED_SYNC_STACK_FRAME_CONTENT_PREFIX_PATTERN.test(line)
  );
}
