// Browser shim for `node:crypto`, used only because business-repository's
// util.ts calls randomBytes() when assigning canonical ids. In the demo the
// in-memory fake adapter is used, so we just need a hex-capable randomBytes.
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

export { randomBytes };
