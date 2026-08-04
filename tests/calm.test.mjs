import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

test("Calm hides every textual tool row and restores stock presentation", { concurrency: false }, async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-calm-test-"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  writeFileSync(join(agentDir, "calm"), "on\n", { mode: 0o600 });
  const originalToolRender = ToolExecutionComponent.prototype.render;
  ToolExecutionComponent.prototype.render = () => ["stock tool output"];

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
    assert.equal(handlers.has("agent_start"), false);
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
    const fire = async (event) => {
      for (const handler of handlers.get(event) ?? []) await handler({}, ctx);
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
    assert.ok(calls.some(([name, value]) => name === "message" && value === "Working..."));
    assert.ok(calls.some(([name, value]) => name === "visible" && value === true));
    assert.equal(calls.some(([name]) => name === "widget"), false);

    calls.length = 0;
    await calmCommand.handler("", ctx);
    assert.equal(expanded, true);
    assert.ok(calls.some(([name, value]) => name === "indicator" && value === undefined));
    assert.ok(calls.some(([name, value]) => name === "message" && value === undefined));
    assert.deepEqual(customToolRow.render(80), ["stock tool output"]);

    calls.length = 0;
    await fire("session_shutdown");
    assert.ok(calls.some(([name, value]) => name === "indicator" && value === undefined));
    assert.ok(calls.some(([name, value]) => name === "message" && value === undefined));
    assert.equal(calls.some(([name]) => name === "widget"), false);
  } finally {
    ToolExecutionComponent.prototype.render = originalToolRender;
    rmSync(agentDir, { recursive: true, force: true });
    delete process.env.PI_CODING_AGENT_DIR;
  }
});
