/** Reserve 18% of neutral model height above, 8% of its width on each side,
 * and keep the soles 5% of the viewport above its bottom edge. */
export function frameSize(modelWidth: number, modelHeight: number, aspect: number): { width: number; height: number } {
  const height = Math.max(modelHeight * 1.18 / 0.95, modelWidth * 1.16 / aspect, 0.1);
  return { width: height * aspect, height };
}
