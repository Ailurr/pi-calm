import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const STOCK_TOOL_LINES = [
  "\u001b[48;2;40;40;40m                    \u001b[0m",
  "\u001b[36mfetch_content https://example.com\u001b[0m",
  "partial response body",
];

test("Calm uses one dynamic working row and hides textual tool rows", { concurrency: false }, async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-calm-test-"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  writeFileSync(join(agentDir, "calm"), "on\n", { mode: 0o600 });
  const originalToolRender = ToolExecutionComponent.prototype.render;
  const supersededPatchKey = Symbol.for("pi-calm:tool-shell-layout:nonblank:v3");
  const activePatchKey = Symbol.for("pi-calm:tool-shell-layout:working-row:v4");
  const supersededPatch = { hidesShell: () => true };
  globalThis[supersededPatchKey] = supersededPatch;
  ToolExecutionComponent.prototype.render = () =>
    supersededPatch.hidesShell() ? [] : STOCK_TOOL_LINES;

  try {
    const extensionUrl = new URL(`../index.ts?test=${Date.now()}`, import.meta.url);
    const extension = await import(pathToFileURL(extensionUrl.pathname).href + extensionUrl.search);
    const handlers = new Map();
    let calmCommand;
    const pi = {
      on(event, handler) {
        const values = handlers.get(event) ?? [];
        values.push(handler);
        handlers.set(event, values);
      },
      registerCommand(name, command) {
        if (name === "calm") calmCommand = command;
      },
      registerTool() {},
    };

    extension.default(pi);
    assert.ok(calmCommand);
    assert.ok(handlers.has("session_start"));
    assert.ok(handlers.has("session_shutdown"));
    assert.ok(handlers.has("agent_start"));
    assert.ok(handlers.has("agent_end"));
    assert.ok(handlers.has("tool_execution_start"));
    assert.ok(handlers.has("tool_execution_end"));
    assert.equal(handlers.has("agent_settled"), false);

    const calls = [];
    let expanded = true;
    const ui = {
      getEditorText: () => "",
      getToolsExpanded: () => expanded,
      onTerminalInput: () => () => {},
      setHiddenThinkingLabel(value) { calls.push(["thinking", value]); },
      setToolsExpanded(value) { expanded = value; },
      setWidget(...args) { calls.push(["widget", ...args]); },
      setWorkingIndicator(value) { calls.push(["indicator", value]); },
      setWorkingMessage(value) { calls.push(["message", value]); },
      setWorkingVisible(value) { calls.push(["visible", value]); },
    };
    const ctx = { ui };
    const fire = async (event, payload = {}) => {
      for (const handler of handlers.get(event) ?? []) {
        await handler({ type: event, ...payload }, ctx);
      }
    };

    await fire("session_start");
    const customToolRow = Object.assign(Object.create(ToolExecutionComponent.prototype), {
      toolName: "fetch_content",
      toolDefinition: {},
      imageComponents: [],
      imageSpacers: [],
    });
    assert.deepEqual(customToolRow.render(80), []);

    const imageToolRow = Object.assign(Object.create(ToolExecutionComponent.prototype), {
      toolName: "fetch_content",
      toolDefinition: {},
      imageComponents: [{ render: () => ["rendered image"] }],
      imageSpacers: [],
    });
    assert.deepEqual(imageToolRow.render(80), ["rendered image"]);
    const indicator = calls.findLast(([name]) => name === "indicator")?.[1];
    assert.deepEqual(indicator, { frames: SPINNER_FRAMES, intervalMs: 80 });
    assert.ok(calls.some(([name, value]) => name === "message" && value === "Thinking..."));

    assert.ok(calls.some(([name, value]) => name === "visible" && value === true));
    assert.equal(calls.some(([name]) => name === "widget"), false);
    calls.length = 0;
    await fire("agent_start");
    assert.equal(calls.findLast(([name]) => name === "message")?.[1], "Thinking...");
    await fire("tool_execution_start", { toolCallId: "read-1", toolName: "read", args: {} });
    assert.equal(calls.findLast(([name]) => name === "message")?.[1], "Working: read...");
    await fire("tool_execution_start", {
      toolCallId: "bash-1",
      toolName: "bash",
      args: { command: "cd /tmp/project && npm test" },
    });
    assert.equal(calls.findLast(([name]) => name === "message")?.[1], "Working: bash...");
    await fire("tool_execution_end", { toolCallId: "bash-1", toolName: "bash", result: {}, isError: false });
    assert.equal(calls.findLast(([name]) => name === "message")?.[1], "Working: read...");
    await fire("tool_execution_end", { toolCallId: "read-1", toolName: "read", result: {}, isError: false });
    assert.equal(calls.findLast(([name]) => name === "message")?.[1], "Thinking...");

    calls.length = 0;
    await calmCommand.handler("", ctx);
    assert.equal(expanded, true);
    assert.ok(calls.some(([name, value]) => name === "indicator" && value === undefined));
    assert.ok(calls.some(([name, value]) => name === "message" && value === undefined));
    assert.deepEqual(customToolRow.render(80), STOCK_TOOL_LINES);

    calls.length = 0;
    await fire("session_shutdown");
    assert.ok(calls.some(([name, value]) => name === "indicator" && value === undefined));
    assert.ok(calls.some(([name, value]) => name === "message" && value === undefined));
    assert.equal(calls.some(([name]) => name === "widget"), false);
  } finally {
    ToolExecutionComponent.prototype.render = originalToolRender;
    delete globalThis[supersededPatchKey];
    delete globalThis[activePatchKey];
    rmSync(agentDir, { recursive: true, force: true });
    delete process.env.PI_CODING_AGENT_DIR;
  }
});
