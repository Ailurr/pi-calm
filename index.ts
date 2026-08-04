// Pi Calm - a standalone conversation-presentation toggle for Pi.
//
// Adapted from the Firstmate project's Calm implementation.
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// Verified against Pi 0.83.0, which exports its shared tool-row component,
// session_start replacement reasons, ExtensionUIContext.setToolsExpanded(),
// setWorkingVisible(), setWorkingIndicator(), setWorkingMessage(), and
// setHiddenThinkingLabel(). ./lib/preference.ts owns the local state file. The
// presentation adapters probe the exact Pi APIs they patch and degrade
// independently with one clear diagnostic if a future Pi removes one. The
// notification adapter hides known Blackhole progress summaries, the tool-row
// adapter hides textual tool output, and the native working row reports
// Thinking... or Working: <tool>... from lifecycle events.
//
// Calm changes presentation only. It never intercepts, transforms, reroutes,
// removes, or reorders semantic input, tool execution, model context, session
// storage, or export data; /export and /share render the complete stock
// transcript.
import { type ExtensionAPI, type ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { getKeybindings } from "@earendil-works/pi-tui";
import { installCalmToolShellLayout } from "./lib/tool-shells.ts";
import { installCalmNotificationLayout } from "./lib/notifications.ts";
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
  installCalmPresentationAdapter("tool-shells", installCalmToolShellLayout);
  installCalmPresentationAdapter("notifications", installCalmNotificationLayout);

  let removeTerminalInputHandler: (() => void) | undefined;

  const activeTools = new Map<string, string>();

  const updateWorkingMessage = (ui: ExtensionUIContext): void => {
    if (!calmPresentationIsActive()) return;
    const currentTool = Array.from(activeTools.values()).at(-1);
    ui.setWorkingMessage(currentTool ? `Working: ${currentTool}...` : "Thinking...");
  };

  // Pi owns animation timing and row visibility. Calm only selects the compact
  // indicator and updates its message from Pi's agent/tool lifecycle events.
  const applyWorkingPresentation = (ui: ExtensionUIContext): void => {
    ui.setWorkingVisible(true);
    if (calmPresentationIsActive()) {
      ui.setWorkingIndicator({
        frames: CALM_WORKING_FRAMES,
        intervalMs: CALM_WORKING_INTERVAL_MS,
      });
      updateWorkingMessage(ui);
      return;
    }

    ui.setWorkingIndicator();
    ui.setWorkingMessage();
  };

  pi.on("agent_start", (_event, ctx) => {
    activeTools.clear();
    updateWorkingMessage(ctx.ui);
  });

  pi.on("tool_execution_start", (event, ctx) => {
    activeTools.delete(event.toolCallId);
    activeTools.set(event.toolCallId, event.toolName);
    updateWorkingMessage(ctx.ui);
  });

  pi.on("tool_execution_end", (event, ctx) => {
    activeTools.delete(event.toolCallId);
    updateWorkingMessage(ctx.ui);
  });

  pi.on("agent_end", (_event, ctx) => {
    activeTools.clear();
    updateWorkingMessage(ctx.ui);
  });

  pi.on("session_start", (_event, ctx) => {
    activeTools.clear();
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
    activeTools.clear();
    removeTerminalInputHandler?.();
    removeTerminalInputHandler = undefined;
    ctx.ui.setWorkingIndicator();
    ctx.ui.setWorkingMessage();
    ctx.ui.setWorkingVisible(true);
  });

  pi.registerCommand("calm", {
    description: "Toggle Calm: hide collapsed thinking and tool execution rows from the transcript (presentation only).",
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
