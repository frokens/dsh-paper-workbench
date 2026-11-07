import { test } from "node:test";
import assert from "node:assert/strict";
import { Context } from "@deepseek-ai/cordis";
import { readOfficeFonts, configureOfficeFonts } from "../src/office-fonts.js";
import { configurePdfFontsRequest, agentRequest } from "../src/contracts.js";

function fixture() {
  const ctx = new Context(), expression = { __jsExpr: "60000" };
  const office = { options: { name: "@deepseek-ai/dsh-office-to-pdf", config: {
    fontDirectories: ["/Existing fonts "], fontFallbacks: [["Arial", "Helvetica"]], timeoutMs: expression, maxFontFiles: 1234,
  } }, fiber: { state: 2 } };
  let writes = 0;
  ctx.provide("configEditor", {
    entries: () => [office, { options: { name: "unrelated-provider", config: { apiKey: "SYNTHETIC_DO_NOT_EXPOSE" } }, fiber: { state: 2 } }],
    edit: async (entry: typeof office, change: (current: typeof office.options.config) => typeof office.options.config) => {
      assert.equal(entry, office); const current = office.options.config, previousDirectories = current.fontDirectories, next = change(current);
      assert.equal(next.timeoutMs, expression); assert.equal(next.maxFontFiles, 1234);
      assert.deepEqual(next.fontFallbacks, [["Arial", "Helvetica"]]);
      assert.deepEqual(current.fontDirectories, previousDirectories, "The adapter does not mutate the owner's current raw config.");
      office.options.config = next; writes++;
    },
  } as never);
  return { ctx, office, get writes() { return writes; } };
}

test("the font form exposes only Office font values and the explicit apply keeps unrelated raw fields and expressions", async () => {
  const owner = fixture(), state = readOfficeFonts(owner.ctx);
  assert.deepEqual(state.directories, ["/Existing fonts "]);
  assert.deepEqual(state.fallbacks, [["Arial", "Helvetica"]]);
  assert.equal(state.canEdit, true);
  await configureOfficeFonts(owner.ctx, { directories: state.directories, expectedDirectories: state.directories }, new AbortController().signal);
  assert.equal(owner.writes, 0, "An unchanged font choice does not rewrite comments or reload the provider.");
  assert.doesNotMatch(JSON.stringify(state), /SYNTHETIC_DO_NOT_EXPOSE|apiKey|timeoutMs|maxFontFiles|entry|__jsExpr/);
  const result = await configureOfficeFonts(owner.ctx, { directories: ["/System/Library/Fonts", "/Library/Fonts"], expectedDirectories: state.directories }, new AbortController().signal);
  assert.equal(owner.writes, 1);
  assert.deepEqual(result.directories, ["/System/Library/Fonts", "/Library/Fonts"]);
  assert.deepEqual(result.fallbacks, state.fallbacks);
});

test("stale, cancelled, invalid and non-human configuration writes leave the existing settings alone", async () => {
  const owner = fixture(), before = owner.office.options.config;
  await assert.rejects(configureOfficeFonts(owner.ctx, { directories: ["/Library/Fonts"], expectedDirectories: null }, new AbortController().signal), /changed/);
  await assert.rejects(configureOfficeFonts(owner.ctx, { directories: ["relative"], expectedDirectories: ["/Existing fonts "] }, new AbortController().signal), /absolute/);
  await assert.rejects(configureOfficeFonts(owner.ctx, { directories: ["/Library/Fonts"], expectedDirectories: ["/Existing fonts "] }, AbortSignal.abort()), /abort/i);
  assert.equal(owner.writes, 0); assert.equal(owner.office.options.config, before);
  const request = { action: "configure_pdf_fonts", directories: ["/Library/Fonts"], expectedDirectories: ["/Existing fonts "], sharedPreviews: true };
  assert.equal(configurePdfFontsRequest.safeParse(request).success, true);
  assert.equal(configurePdfFontsRequest.safeParse({ ...request, sharedPreviews: false }).success, false);
  assert.equal(agentRequest.safeParse(request).success, false);
});

test("dynamic font expressions stay read only and are not exposed as serialized configuration", () => {
  const owner = fixture();
  owner.office.options.config.fontDirectories = { __jsExpr: "SYNTHETIC_PRIVATE_EXPRESSION" } as never;
  const state = readOfficeFonts(owner.ctx);
  assert.equal(state.canEdit, false); assert.match(state.diagnostic!, /dynamic or unsupported/);
  assert.doesNotMatch(JSON.stringify(state), /SYNTHETIC_PRIVATE_EXPRESSION/);
});
