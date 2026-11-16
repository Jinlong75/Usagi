/** Each shutdown operation has its own deadline, including renderer requests. */
export async function waitForQuitTask(operation: () => void | Promise<void>, timeoutMs: number): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(operation),
      new Promise<void>(resolve => { timeout = setTimeout(resolve, timeoutMs); }),
    ]);
  } catch {
    console.error('退出前写盘失败');
  } finally {
    clearTimeout(timeout);
  }
}
