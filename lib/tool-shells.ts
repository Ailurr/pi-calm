// Pi Calm - presentation-only tool-row filter.
//
// Adapted from the Firstmate project's Calm implementation.
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// Tool execution, model context, stored results, exports, and shares remain
// owned by Pi. Calm hides textual TUI rows and keeps image results visible.
import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { calmHidesTranscriptChrome } from "./visibility.ts";

type ToolRowState = {
  imageComponents?: Component[];
  imageSpacers?: Component[];
};

type ToolRender = (this: ToolExecutionComponent, width: number) => string[];

type CalmToolRowPatch = {
  isActive: () => boolean;
  renderHidden: (row: ToolExecutionComponent, width: number) => string[];
  renderStock: ToolRender;
};

const CALM_TOOL_ROW_PATCH = Symbol.for("pi-calm:tool-row:v5");

function renderImages(row: ToolExecutionComponent, width: number): string[] {
  const state = row as unknown as ToolRowState;
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
}

export function installCalmToolShellLayout(): void {
  const registry = globalThis as typeof globalThis & {
    [key: symbol]: CalmToolRowPatch | undefined;
  };
  const isActive = (): boolean => calmHidesTranscriptChrome();
  const installed = registry[CALM_TOOL_ROW_PATCH];

  if (installed) {
    installed.isActive = isActive;
    installed.renderHidden = renderImages;
    return;
  }

  const renderStock = ToolExecutionComponent.prototype.render;
  if (typeof renderStock !== "function") {
    throw new Error("Pi Calm requires Pi ToolExecutionComponent.render");
  }

  const patch: CalmToolRowPatch = { isActive, renderHidden: renderImages, renderStock };
  ToolExecutionComponent.prototype.render = function (width: number): string[] {
    return patch.isActive()
      ? patch.renderHidden(this, width)
      : patch.renderStock.call(this, width);
  };

  registry[CALM_TOOL_ROW_PATCH] = patch;
}
