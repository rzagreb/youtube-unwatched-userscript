// View counts as YouTube writes them in English: "1,234", "1.5K", "2M views", "No views".

const UNITS = { k: 1e3, m: 1e6, b: 1e9, thousand: 1e3, million: 1e6, billion: 1e9 };
const COUNT = /^((?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?)\s*(k|m|b|thousand|million|billion)?$/i;

/** "1,000", "1.5K" or "2 million" as a number; null when it isn't a count. */
export function parseCount(text) {
  const match = COUNT.exec(text.trim());
  if (!match) return null;
  const count = Number(match[1].replace(/[,\s]/g, '')) * (UNITS[match[2]?.toLowerCase()] ?? 1);
  return count <= Number.MAX_SAFE_INTEGER ? count : null;
}

/** Count in a label like "1.2M views". With `bare`, a lone "42K" counts too. */
export function parseViewLabel(text, { bare = false } = {}) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (/^no views?$/i.test(clean)) return 0;
  const label = /^(.*?)\s*views?\b/i.exec(clean);
  if (label) return parseCount(label[1]);
  return bare ? parseCount(clean) : null;
}
