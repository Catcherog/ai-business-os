// Browser shim for `node:crypto`, used only because business-repository's
// util.ts calls randomBytes() and golden-path / service-agent-candidate call
// randomUUID() when assigning canonical ids. In the demo the in-memory fake
// adapter is used, so we just need hex-capable randomBytes and a UUID v4.
function randomBytes(n) {
  const buf = new Uint8Array(n);
  globalThis.crypto.getRandomValues(buf);
  buf.toString = function (enc) {
    if (enc === 'hex') {
      return Array.from(this)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
    return Array.prototype.toString.call(this);
  };
  return buf;
}

function randomUUID() {
  // crypto.randomUUID is available in modern browsers; fall back for older runtimes.
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return (
    hex.slice(0, 8) +
    '-' +
    hex.slice(8, 12) +
    '-' +
    hex.slice(12, 16) +
    '-' +
    hex.slice(16, 20) +
    '-' +
    hex.slice(20, 32)
  );
}

export { randomBytes, randomUUID };

