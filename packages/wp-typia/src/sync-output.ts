const SYNC_STACK_FRAME_PATTERN =
  /^\s*at\s+.*(?:\([^()\r\n]+:\d+:\d+\)|[^()\s]+:\d+:\d+)\s*$/u;

export function isSyncStackFrameLine(line: string): boolean {
  return SYNC_STACK_FRAME_PATTERN.test(line);
}
