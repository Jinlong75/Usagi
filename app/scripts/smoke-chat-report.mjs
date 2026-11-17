const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function validChatRounds(rounds) {
  if (!Array.isArray(rounds) || rounds.length !== 12) return false;
  const shape = sample => JSON.stringify([sample.ipc, sample.webContents]);
  return Array.from(rounds).every((sample, index) => object(sample) && sample.round === index + 1 && sample.renderGone === 0 && sample.childGone === 0 &&
    Number.isInteger(sample.windows) && sample.windows > 0 && sample.windows === rounds[0].windows &&
    object(sample.ipc) && object(sample.memory) && Array.isArray(sample.webContents) && sample.webContents.length === sample.windows &&
    Array.from(sample.webContents).every(wc => object(wc) && Number.isInteger(wc.id) && object(wc.listeners) && Object.values(wc.listeners).every(Number.isInteger)) &&
    Object.values(sample.ipc).every(Number.isInteger) &&
    Number.isFinite(sample.memory?.rss) && sample.memory.rss > 0 && Number.isFinite(sample.memory.heapUsed) && sample.memory.heapUsed > 0 &&
    (index < 2 || shape(sample) === shape(rounds[1])));
}
