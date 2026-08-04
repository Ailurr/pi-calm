// Pi Calm - presentation-only extension notification filter.
//
// Pi routes every extension ctx.ui.notify() call through
// InteractiveMode.showExtensionNotify(). Calm suppresses only known low-value
// Blackhole progress summaries while preserving warnings, errors, manual memory
// output, session data, and the underlying memory pipeline.
import { InteractiveMode } from "@earendil-works/pi-coding-agent";
import { calmPresentationIsActive } from "./visibility.ts";

type NotificationType = "info" | "warning" | "error" | undefined;
type ExtensionNotify = (
  this: InteractiveMode,
  message: string,
  type?: NotificationType,
) => void;

type InteractiveModeNotificationPrototype = {
  showExtensionNotify: ExtensionNotify;
};

type CalmNotificationPatch = {
  isActive: () => boolean;
  shouldHide: (message: string, type?: NotificationType) => boolean;
  notifyStock: ExtensionNotify;
};

const CALM_NOTIFICATION_PATCH = Symbol.for("pi-calm:extension-notify:v1");
const OBSERVATIONAL_MEMORY_RUNNING =
  /^Observational memory: (?:observer|reflector|dropper) running(?:\s|$)/;
const BLACKHOLE_COMPACTION_STATS =
  /^blackhole: [\d,]+ source entries processed; tail kept \d+\/\d+ user turns(?:;|$)/;

function shouldHideNotification(message: string, type?: NotificationType): boolean {
  if (type !== undefined && type !== "info") return false;
  return OBSERVATIONAL_MEMORY_RUNNING.test(message) || BLACKHOLE_COMPACTION_STATS.test(message);
}

export function installCalmNotificationLayout(): void {
  const registry = globalThis as typeof globalThis & {
    [key: symbol]: CalmNotificationPatch | undefined;
  };
  const isActive = (): boolean => calmPresentationIsActive();
  const installed = registry[CALM_NOTIFICATION_PATCH];

  if (installed) {
    installed.isActive = isActive;
    installed.shouldHide = shouldHideNotification;
    return;
  }

  const prototype = InteractiveMode.prototype as unknown as InteractiveModeNotificationPrototype;
  const notifyStock = prototype.showExtensionNotify;
  if (typeof notifyStock !== "function") {
    throw new Error("Pi Calm requires Pi InteractiveMode.showExtensionNotify");
  }

  const patch: CalmNotificationPatch = {
    isActive,
    shouldHide: shouldHideNotification,
    notifyStock,
  };
  prototype.showExtensionNotify = function (
    message: string,
    type?: NotificationType,
  ): void {
    if (patch.isActive() && patch.shouldHide(message, type)) return;
    patch.notifyStock.call(this, message, type);
  };

  registry[CALM_NOTIFICATION_PATCH] = patch;
}
