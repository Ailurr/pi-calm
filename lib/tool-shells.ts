// Pi Calm - gapless tool-shell presentation adapter.
//
// Adapted from the Firstmate project's Calm implementation.
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// Calm filters textual tool rows from the interactive TUI. Tool execution,
// model context, stored results, exports, and shares remain owned by Pi. Image
// results stay visible without their textual shell.
import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { calmHidesTranscriptChrome } from "./visibility.ts";

type ToolRowPresentationState = {
  imageComponents?: Component[];
  imageSpacers?: Component[];
};

type CalmToolShellPatch = {
  hidesShell: () => boolean;
};

// Use a new key so /reload replaces active-line patches resident in Pi.
const CALM_TOOL_SHELL_PATCH = Symbol.for("pi-calm:tool-shell-layout:working-row:v4");
const SUPERSEDED_TOOL_SHELL_PATCHES = [
  Symbol.for("pi-calm:tool-shell-layout:nonblank:v3"),
  Symbol.for("pi-calm:tool-shell-layout:active-line:v2"),
  Symbol.for("pi-calm:tool-shell-layout:all-tools:v1"),
  Symbol.for("pi-calm:built-in-tool-shell-layout:pi-0.82.0"),
];

export function installCalmToolShellLayout(): void {
  const registry = globalThis as typeof globalThis & {
    [key: symbol]: CalmToolShellPatch | undefined;
  };
  const hidesShell = (): boolean => calmHidesTranscriptChrome();
  const installed = registry[CALM_TOOL_SHELL_PATCH];
  if (installed) {
    installed.hidesShell = hidesShell;
    return;
  }

  for (const supersededKey of SUPERSEDED_TOOL_SHELL_PATCHES) {
    const superseded = registry[supersededKey];
    if (superseded) superseded.hidesShell = () => false;
  }

  if (typeof ToolExecutionComponent !== "function") {
    throw new Error("Pi Calm requires Pi ToolExecutionComponent");
  }
  const originalRender = ToolExecutionComponent.prototype.render;
  if (typeof originalRender !== "function") {
    throw new Error("Pi Calm requires Pi ToolExecutionComponent.render");
  }

  const patch: CalmToolShellPatch = { hidesShell };
  ToolExecutionComponent.prototype.render = function (width: number): string[] {
    if (!patch.hidesShell()) return originalRender.call(this, width);

    const state = this as unknown as ToolRowPresentationState;

    const images = state.imageComponents ?? [];
    const spacers = state.imageSpacers ?? [];
    const lines: string[] = [];
    for (let index = 0; index < images.length; index += 1) {
      const spacer = spacers[index];
      if (spacer) lines.push(...spacer.render(width));
      const image = images[index];
      if (image) lines.push(...image.render(width));
    }
    return lines;
  };

  registry[CALM_TOOL_SHELL_PATCH] = patch;
}
