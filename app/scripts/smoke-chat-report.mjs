export function validChatRounds(rounds) {
  if (!Array.isArray(rounds) || rounds.length !== 12) return false;
  const shape = sample => JSON.stringify([sample.ipc, sample.webContents]);
  return rounds.every((sample, index) => sample.round === index + 1 && sample.renderGone === 0 && sample.childGone === 0 &&
    Number.isInteger(sample.windows) && sample.windows > 0 && sample.windows === rounds[0].windows &&
    sample.ipc && Array.isArray(sample.webContents) && sample.webContents.length === sample.windows &&
    sample.webContents.every(wc => Number.isInteger(wc.id) && wc.listeners && Object.values(wc.listeners).every(Number.isInteger)) &&
    Object.values(sample.ipc).every(Number.isInteger) &&
    Number.isFinite(sample.memory?.rss) && sample.memory.rss > 0 && Number.isFinite(sample.memory.heapUsed) && sample.memory.heapUsed > 0 &&
    (index < 2 || shape(sample) === shape(rounds[1])));
}
