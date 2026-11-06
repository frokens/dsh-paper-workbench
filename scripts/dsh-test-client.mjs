import { Context } from "@deepseek-ai/cordis";
import { TypertRegistry } from "@deepseek-ai/dsh-typert-registry";
import { installConnection } from "@deepseek-ai/dsh-client-connection/client";
import { apply as applyGateway } from "@deepseek-ai/dsh-api-gateway/client";
import WebSocket from "ws";

async function authenticate() {
  const url = process.env.DSH_TEST_URL;
  if (!url)
    throw new Error("Set DSH_TEST_URL to the disposable host launch URL.");
  const authenticated = await fetch(url, { redirect: "manual" });
  const cookie = authenticated.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  if (!cookie)
    throw new Error("The launch URL did not authenticate the test client.");
  const origin = new URL(url).origin;
  return { origin, cookie };
}
// Test-only adapter for the existing DSH HTTP RPC envelope.
function caller({ origin, cookie }) {
  return async (method, args, signal) => {
    const response = await fetch(`${origin}/api/${method}`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", origin, cookie },
      body: JSON.stringify({
        type: "client-request",
        rpcId: crypto.randomUUID(),
        method,
        payload: { args },
      }),
    });
    if (!response.ok) throw new Error(`DSH returned HTTP ${response.status}`);
    const envelope = await response.json();
    if (!envelope.result?.ok)
      throw new Error(JSON.stringify(envelope.result?.error ?? envelope));
    return envelope.result.value;
  };
}
export async function connectHost() {
  return caller(await authenticate());
}

// The production DSH Client owns Remote codecs, sockets, streams and disposal.
export async function connectPaperClient(remoteInfo) {
  const authentication = await authenticate(),
    context = new Context(),
    fibers = [];
  let client, dispose;
  const close = async () => {
    await dispose?.();
    for (const fiber of [...fibers].reverse()) await fiber.dispose();
  };
  try {
    fibers.push(
      context.plugin({
        name: "paper-test-registry",
        apply(ctx) {
          new TypertRegistry(ctx);
        },
      }),
    );
    await fibers.at(-1);
    fibers.push(
      context.plugin({
        name: "paper-test-connection",
        apply(ctx) {
          installConnection(ctx, {
            interactions: "none",
            transport: {
              streamBaseUrl: authentication.origin,
              createWebSocket: (url) =>
                new WebSocket(url, {
                  headers: {
                    origin: authentication.origin,
                    cookie: authentication.cookie,
                  },
                }),
              fetch(input, init) {
                const headers = new Headers(init.headers);
                headers.set("origin", authentication.origin);
                headers.set("cookie", authentication.cookie);
                return fetch(new URL(input, authentication.origin), {
                  ...init,
                  headers,
                });
              },
            },
          });
        },
      }),
    );
    await fibers.at(-1);
    fibers.push(
      context.plugin({
        name: "paper-test-gateway",
        inject: ["typert", "connection"],
        apply(ctx) {
          applyGateway(ctx);
          client = ctx;
        },
      }),
    );
    await fibers.at(-1);
    dispose = await client.remote.$mount(remoteInfo);
    return {
      paper: client.get("remote.paperWorkbench"),
      rpc: caller(authentication),
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
