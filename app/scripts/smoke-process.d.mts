export function runSmokeProcess(executable: string, args: string[], options?: {
  cwd?: string;
  timeoutMs?: number;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}): Promise<number>;
