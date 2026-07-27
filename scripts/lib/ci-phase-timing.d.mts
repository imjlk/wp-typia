export interface CiPhaseTimingRecord {
  durationMs: number;
  name: string;
  outcome: 'failed' | 'passed';
}

export interface CiPhaseTimer {
  flush(): void;
  measureSync<T>(name: string, callback: () => T): T;
  phases: CiPhaseTimingRecord[];
}

export interface CiPhaseTimerOptions {
  now?: () => number;
  output?: {
    write(message: string): unknown;
  };
  summaryPath?: string;
  title: string;
}

export function formatCiPhaseDuration(durationMs: number): string;

export function createCiPhaseTimer(
  options: CiPhaseTimerOptions,
): CiPhaseTimer;
