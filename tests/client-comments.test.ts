import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import ts from "typescript";

// Execute the component's exact callbacks with controlled RPC/stream timing.
// This covers client state mechanics, not React rendering or native UI behavior.
const source = await readFile(new URL("../src/client.tsx", import.meta.url), "utf8");
const syntax = ts.createSourceFile("client.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callback(component: string, hook: string, contains: string, scope: Record<string, unknown>) {
  const declaration = syntax.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === component);
  assert.ok(declaration);
  let selected: ts.ArrowFunction | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(syntax) === `React.${hook}`
      && ts.isArrowFunction(node.arguments[0]) && node.arguments[0].body.getText(syntax).includes(contains)) selected = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(declaration); assert.ok(selected, `${component}.${hook} callback not found`);
  const compiled = ts.transpileModule(`const selected = ${selected.getText(syntax)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(scope), `${compiled}\nreturn selected;`)(...Object.values(scope)) as () => unknown;
}
function editor() {
  const draft = { id: randomUUID(), target: { kind: "source", selections: [
    { paperId: "paper", revision: 0, blockId: "paragraph", from: 4, to: 11, quote: "Planner" },
  ] } };
  const state = { text: "Clarify the Planner's action.", saving: false, error: "" };
  const scope = {
    draft, sessionId: "ordinary-task", cache: new Map([[draft.id, state.text]]),
    latest: { current: state.text }, saved: { current: "" }, version: { current: 0 },
    active: { current: true }, pending: { current: undefined as Promise<void> | undefined },
    retry: { current: undefined as { content: string; expectedVersion: number } | undefined },
    controller: { current: undefined as AbortController | undefined },
    call: async (_sessionId: string, request: { id: string; comment: string; expectedVersion: number }, _signal: AbortSignal) =>
      ({ paper: { feedback: [{ id: request.id, comment: request.comment, version: request.expectedVersion + 1 }] } }),
    setSaving: (value: boolean) => { state.saving = value; }, setError: (value: string) => { state.error = value; },
    t: (key: string) => key,
  };
  const flush = () => callback("CommentEditor", "useCallback", 'action: "save_feedback"', scope)() as Promise<void>;
  return { draft, state, scope, flush };
}
function connection(edit: ReturnType<typeof editor>) {
  const view = { paper: { id: "paper", blocks: [{ id: "paragraph" }] } }, drafts = [edit.draft];
  const state = { view: view as unknown, drafts, connection: "live", connectionError: "", error: "" };
  const scope = {
    sessionId: "ordinary-task", cache: { current: edit.scope.cache }, submission: { current: { requestId: "saved-submission" } },
    controller: { current: new AbortController() }, submittingController: { current: new AbortController() },
    setView: (value: unknown) => { state.view = value; }, setDrafts: (value: typeof drafts) => { state.drafts = value; },
    setConnection: (value: string) => { state.connection = value; }, setConnectionError: (value: string) => { state.connectionError = value; },
    setError: (value: string) => { state.error = value; },
    setPicked: () => {}, setSelected: () => {}, setPreview: () => {}, setComparison: () => {},
    observe: async function* (_sessionId: string, signal: AbortSignal): AsyncGenerator<unknown, void, unknown> {
      if (!signal.aborted) await new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
    },
  };
  const connect = () => callback("Workbench", "useEffect", "observe(sessionId, stream.signal)", scope)() as () => void;
  return { state, scope, view, drafts, connect };
}

test("failed autosave survives a same-task Refresh with its text, exact anchor and original retry payload", async () => {
  const edit = editor(), requests: object[] = [];
  const save = edit.scope.call;
  edit.scope.call = async (...args) => {
    requests.push(structuredClone(args[1]));
    if (requests.length === 1) throw new Error("Controlled network failure.");
    return save(...args);
  };
  await assert.rejects(edit.flush(), /network failure/);
  const retry = edit.scope.retry.current;
  const stream = connection(edit), stopFirst = stream.connect(); stopFirst();
  const stopSecond = stream.connect();
  try {
    assert.strictEqual(stream.state.view, stream.view, "Reconnect must not unmount the current document/editor.");
    assert.strictEqual(stream.state.drafts, stream.drafts);
    assert.equal(edit.scope.cache.get(edit.draft.id), edit.state.text);
    assert.strictEqual(edit.scope.retry.current, retry);
    assert.deepEqual(stream.state.drafts[0].target, edit.draft.target);
    await edit.flush();
    assert.deepEqual(requests[1], requests[0]);
    assert.equal(edit.scope.version.current, 1); assert.equal(edit.scope.saved.current, edit.state.text);
  } finally { stopSecond(); }
});

test("connection recovery keeps the document and drafts while normal stream completion becomes offline", async () => {
  const edit = editor(), stream = connection(edit);
  let finish!: () => void;
  const ending = new Promise<void>(resolve => { finish = resolve; });
  stream.scope.observe = async function* () { yield stream.view; await ending; };
  const stop = stream.connect();
  assert.equal(stream.state.connection, "loading");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stream.state.connection, "live");
  finish(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(stream.state.connection, "offline");
  assert.strictEqual(stream.state.view, stream.view); assert.strictEqual(stream.state.drafts, stream.drafts);
  stop();
});

test("a connection failure keeps its diagnostic separate from action errors and saved comment state", async () => {
  const edit = editor(), stream = connection(edit);
  stream.state.error = "A separate action needs attention.";
  stream.scope.observe = async function* () { throw new Error("Controlled stream failure."); };
  const stop = stream.connect();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stream.state.connection, "offline");
  assert.match(stream.state.connectionError, /Controlled stream failure/);
  assert.equal(stream.state.error, "A separate action needs attention.");
  assert.strictEqual(stream.state.view, stream.view); assert.strictEqual(stream.state.drafts, stream.drafts);
  stop();
});

test("Refresh leaves an in-flight autosave alive and coalesces subsequent text into the same anchored comment", async () => {
  const edit = editor(), requests: { id: string; comment: string; expectedVersion: number }[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), save = edit.scope.call;
  edit.scope.call = async (...args) => {
    requests.push(structuredClone(args[1]));
    if (requests.length === 1) await gate;
    return save(...args);
  };
  const pending = edit.flush(), requestController = edit.scope.controller.current;
  const stream = connection(edit), stopFirst = stream.connect(); stopFirst();
  const stopSecond = stream.connect();
  try {
    assert.strictEqual(stream.state.view, stream.view); assert.strictEqual(stream.state.drafts, stream.drafts);
    assert.equal(requestController?.signal.aborted, false);
    assert.equal(stream.scope.controller.current.signal.aborted, false);
    const latest = "Clarify the Planner's action and feedback.";
    edit.scope.latest.current = latest; edit.scope.cache.set(edit.draft.id, latest);
    release(); await pending;
    assert.equal(requests.length, 2); assert.equal(new Set(requests.map(request => request.id)).size, 1);
    assert.equal(requests[0].expectedVersion, 0); assert.equal(requests[1].expectedVersion, 1);
    assert.equal(edit.scope.saved.current, latest); assert.equal(edit.scope.version.current, 2);
    assert.equal(edit.scope.cache.has(edit.draft.id), false);
  } finally { release(); stopSecond(); await pending; }
});

test("an acknowledged v2 comment rejects older observations, accepts newer clean versions and preserves dirty/in-flight text", async () => {
  const edit = editor();
  edit.scope.version.current = 2; edit.scope.saved.current = edit.scope.latest.current; edit.scope.cache.clear();
  const reconcile = (record: { version: number; comment: string }) => callback("CommentEditor", "useEffect", "saved.current = record.comment", {
    ...edit.scope, saving: edit.state.saving, record, setText: (value: string) => { edit.state.text = value; },
  })();
  reconcile({ version: 1, comment: "Old observed wording." });
  assert.equal(edit.scope.version.current, 2); assert.equal(edit.state.text, "Clarify the Planner's action.");
  reconcile({ version: 2, comment: edit.state.text });
  assert.equal(edit.scope.version.current, 2);
  const requests: { expectedVersion: number }[] = [], save = edit.scope.call;
  edit.scope.call = async (...args) => { requests.push(args[1]); return save(...args); };
  edit.state.text = edit.scope.latest.current = "A subsequent local edit."; await edit.flush();
  assert.equal(requests[0].expectedVersion, 2);
  reconcile({ version: 3, comment: "A subsequent local edit." });
  assert.equal(edit.scope.version.current, 3); assert.equal(edit.state.text, "A subsequent local edit.");
  reconcile({ version: 4, comment: "Newer external wording." });
  assert.equal(edit.scope.version.current, 4); assert.equal(edit.state.text, "Newer external wording.");
  edit.state.text = edit.scope.latest.current = "Unsaved local wording.";
  reconcile({ version: 5, comment: "Another external edit." });
  assert.equal(edit.scope.latest.current, "Unsaved local wording."); assert.equal(edit.scope.version.current, 4);
  assert.equal(edit.state.text, "Unsaved local wording.");
  edit.scope.latest.current = edit.scope.saved.current; edit.state.saving = true;
  reconcile({ version: 5, comment: "Another external edit." });
  assert.equal(edit.scope.version.current, 4);
  edit.state.saving = false; edit.scope.retry.current = { content: "A failed local edit.", expectedVersion: 4 };
  reconcile({ version: 5, comment: "Another external edit." });
  assert.equal(edit.scope.version.current, 4);
});
