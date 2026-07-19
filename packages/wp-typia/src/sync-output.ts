const SYNC_STACK_FRAME_PATTERN =
  /^\s*at\s+.*(?:\([^()\r\n]+:\d+:\d+\)|[^()\s]+:\d+:\d+)\s*$/u;
const SYNC_STACK_FRAME_PREFIX_PATTERN = /^\s*(?:a(?:t(?:\s.*)?)?)?$/u;

export function isSyncStackFrameLine(line: string): boolean {
  return SYNC_STACK_FRAME_PATTERN.test(line);
}

export function isPossibleSyncStackFramePrefix(line: string): boolean {
  return SYNC_STACK_FRAME_PREFIX_PATTERN.test(line);
}
