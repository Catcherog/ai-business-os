// H1-04 server smoke — drives the SERVER-ONLY CONNECTED boundary probe.
// With NO Feishu/Lumen credentials present, the boundary MUST short-circuit to
// BLOCKED (honest — it never substitutes a faked LIVE result). This is the
// automated stand-in for the live gate that is blocked by BL-018 (CloudBase
// quota + missing credentials).
const driver = await import(new URL('./server/dist/action-driver.js', import.meta.url).href);

let failed = false;
const probe = await driver.runConnectedProbe({}); // empty env => no credentials

if (probe.mode !== 'BLOCKED') {
  console.error('FAIL: expected BLOCKED without credentials, got', probe.mode);
  failed = true;
}
if (!probe.reason || !/credential/i.test(probe.reason)) {
  console.error('FAIL: BLOCKED must carry a credential reason, got', probe.reason);
  failed = true;
}

if (!failed) {
  console.log('SMOKE_SERVER_OK', JSON.stringify({ mode: probe.mode, reason: probe.reason }));
}
console.log(failed ? 'SMOKE_SERVER_FAIL' : 'SMOKE_SERVER_OK');
process.exit(failed ? 1 : 0);
