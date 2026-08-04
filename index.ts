// Pi Calm - a standalone conversation-presentation toggle for Pi.
//
// Adapted from the Firstmate project's Calm implementation.
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// Verified against Pi 0.83.0, which exports its shared tool-row component,
// session_start replacement reasons, ExtensionUIContext.setToolsExpanded(),
// setWorkingVisible(), setWorkingIndicator(), setWorkingMessage(), and
// setHiddenThinkingLabel(). ./lib/preference.ts owns the local state file. The collapsed-thinking
// presentation adapter probes the exact public API seam it patches and degrades
// independently with one clear diagnostic (see installCalmPresentationAdapter
// below) if a future Pi removes it. The shared tool-row adapter is limited to
// Pi's seven known built-in names, so generic custom tools and unsupported
// transcript classes deliberately stay visible.
//
// Calm changes presentation only. It never intercepts, transforms, reroutes,
// removes, or reorders semantic input, tool execution, model context, session
// storage, or export data; /export and /share render the complete stock
// transcript.
import { type ExtensionAPI, type ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { getKeybindings } from "@earendil-works/pi-tui";
import { installCalmBuiltInToolShellLayout } from "./lib/built-in-tool-shells.ts";
import { installCalmCollapsedThinkingLayout } from "./lib/collapsed-thinking.ts";
import { loadCalmPreference, persistCalmPreference } from "./lib/preference.ts";
import {
  calmPresentationIsActive,
  setCalmPresentation,
  setCalmStockExportRendering,
} from "./lib/visibility.ts";

const CALM_WORKING_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const CALM_WORKING_INTERVAL_MS = 80;

// Each presentation adapter probes the exact Pi API it patches. If a future Pi
// removes that API, only the affected adapter degrades; the rest of Calm keeps
// working.
function installCalmPresentationAdapter(name: string, install: () => void): void {
  try {
    install();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`Pi Calm: ${name} presentation adapter unavailable, skipping. ${reason}`);
  }
}

export default function (pi: ExtensionAPI) {
  installCalmPresentationAdapter("collapsed-thinking", installCalmCollapsedThinkingLayout);
  installCalmPresentationAdapter("built-in-tool-shells", installCalmBuiltInToolShellLayout);

  let removeTerminalInputHandler: (() => void) | undefined;

  // Pi owns animation timing and visibility for its single-line working row. Calm
  // only selects a compact indicator while active, so it creates no widgets,
  // timers, width-dependent geometry, or agent-run lifecycle state.
  const applyWorkingPresentation = (ui: ExtensionUIContext): void => {
    ui.setWorkingVisible(true);
    if (calmPresentationIsActive()) {
      ui.setWorkingIndicator({
        frames: CALM_WORKING_FRAMES,
        intervalMs: CALM_WORKING_INTERVAL_MS,
      });
      ui.setWorkingMessage("Working...");
      return;
    }

    ui.setWorkingIndicator();
    ui.setWorkingMessage();
  };

  pi.on("session_start", (_event, ctx) => {
    setCalmPresentation(loadCalmPreference());
    setCalmStockExportRendering(false);
    applyWorkingPresentation(ctx.ui);
    ctx.ui.setHiddenThinkingLabel(calmPresentationIsActive() ? "" : undefined);
    removeTerminalInputHandler?.();
    removeTerminalInputHandler = ctx.ui.onTerminalInput((data) => {
      if (!getKeybindings().matches(data, "tui.input.submit")) return undefined;

      const input = ctx.ui.getEditorText().trim();
      if (
        input !== "/share" &&
        input !== "/export" &&
        !input.startsWith("/export ")
      ) {
        return undefined;
      }

      // /export and /share render through the same tool renderers the transcript
      // uses, so force stock output for the duration of the command. Session and
      // export data are never filtered; this only concerns the visual components.
      setCalmStockExportRendering(true);
      setTimeout(() => {
        setCalmStockExportRendering(false);
        const expanded = ctx.ui.getToolsExpanded();
        ctx.ui.setToolsExpanded(!expanded);
        ctx.ui.setToolsExpanded(expanded);
      }, 0);
      return undefined;
    });
  });

  pi.on("session_shutdown", (_event, ctx) => {
    removeTerminalInputHandler?.();
    removeTerminalInputHandler = undefined;
    ctx.ui.setWorkingIndicator();
    ctx.ui.setWorkingMessage();
    ctx.ui.setWorkingVisible(true);
  });

  pi.registerCommand("calm", {
    description: "Toggle Calm: hide collapsed thinking and built-in tool shells from the transcript (presentation only).",
    handler: async (_args, ctx) => {
      const active = !calmPresentationIsActive();
      // Persist first: if the state file cannot be written, the toggle fails
      // with a clear error instead of silently reverting on the next restart.
      persistCalmPreference(active);
      setCalmPresentation(active);
      applyWorkingPresentation(ctx.ui);
      ctx.ui.setHiddenThinkingLabel(active ? "" : undefined);

      // Flip expansion twice to force a transcript redraw while preserving the
      // user's exact Ctrl+O tools-expanded state.
      const expanded = ctx.ui.getToolsExpanded();
      ctx.ui.setToolsExpanded(!expanded);
      ctx.ui.setToolsExpanded(expanded);
    },
  });
}
