// Test-only adapter for the real DSH HTTP RPC envelope.
export async function connectHost() {
  const url = process.env.DSH_TEST_URL;
  if (!url) throw new Error('Set DSH_TEST_URL to the disposable host launch URL.');
  const authenticated = await fetch(url, { redirect: 'manual' });
  const cookie = authenticated.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  if (!cookie) throw new Error('The launch URL did not authenticate the test client.');
  const origin = new URL(url).origin;
  return async (method, args) => {
    const response = await fetch(`${origin}/api/${method}`, { method: 'POST', headers: { 'content-type': 'application/json', origin, cookie },
      body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args } }) });
    if (!response.ok) throw new Error(`DSH returned HTTP ${response.status}`);
    const envelope = await response.json();
    if (!envelope.result?.ok) throw new Error(JSON.stringify(envelope.result?.error ?? envelope));
    return envelope.result.value;
  };
}

