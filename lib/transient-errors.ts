// Pi Calm - 自动重试错误的纯展示适配器。
//
// Provider error 仍完整保存在 session 和导出中。Calm 只在自动重试尚未
// settled 时折叠错误行；最终失败会恢复最后一条错误。
import {
  AssistantMessageComponent,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { calmHidesTranscriptChrome } from "./visibility.ts";

type AssistantMessage = Parameters<AssistantMessageComponent["updateContent"]>[0];

type AssistantMessagePresentationState = {
  lastMessage?: AssistantMessage;
};

type AssistantRender = AssistantMessageComponent["render"];

type TransientErrorPatch = {
  candidate?: AssistantMessage;
  hiddenKeys: Set<string>;
  hiddenObjects: WeakSet<object>;
  isActive: () => boolean;
  renderStock: AssistantRender;
};

const TRANSIENT_ERROR_PATCH = Symbol.for("pi-calm:transient-assistant-errors:v1");
const CAPPED_RETRY_MESSAGE_TYPE = "capped-retry";

function isAssistantMessage(value: unknown): value is AssistantMessage {
  return typeof value === "object" && value !== null &&
    (value as { role?: unknown }).role === "assistant";
}

function finalAssistant(messages: readonly unknown[]): AssistantMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (isAssistantMessage(message)) return message;
  }
  return undefined;
}

function messageKey(message: AssistantMessage): string | undefined {
  const responseId = (message as AssistantMessage & { responseId?: unknown }).responseId;
  if (typeof responseId === "string" && responseId.length > 0) return `response:${responseId}`;
  if (typeof message.timestamp !== "number") return undefined;
  return `timestamp:${message.timestamp}:${message.provider}:${message.model}:${message.errorMessage ?? ""}`;
}

function hideMessage(patch: TransientErrorPatch, message: AssistantMessage): void {
  patch.hiddenObjects.add(message);
  const key = messageKey(message);
  if (key) patch.hiddenKeys.add(key);
}

function showMessage(patch: TransientErrorPatch, message: AssistantMessage): void {
  patch.hiddenObjects.delete(message);
  const key = messageKey(message);
  if (key) patch.hiddenKeys.delete(key);
}

function messageIsHidden(patch: TransientErrorPatch, message: AssistantMessage): boolean {
  if (patch.hiddenObjects.has(message)) return true;
  const key = messageKey(message);
  return key !== undefined && patch.hiddenKeys.has(key);
}

function restoreFromBranch(patch: TransientErrorPatch, entries: readonly SessionEntry[]): void {
  patch.hiddenObjects = new WeakSet<object>();
  patch.hiddenKeys.clear();
  patch.candidate = undefined;

  let pendingError: AssistantMessage | undefined;
  for (const entry of entries) {
    if (entry.type === "message") {
      const message = entry.message;
      pendingError = isAssistantMessage(message) && message.stopReason === "error"
        ? message
        : undefined;
      continue;
    }
    if (
      entry.type === "custom_message" &&
      entry.customType === CAPPED_RETRY_MESSAGE_TYPE &&
      pendingError
    ) {
      hideMessage(patch, pendingError);
      pendingError = undefined;
    }
  }
}

export function installCalmTransientErrorLayout() {
  const registry = globalThis as typeof globalThis & {
    [key: symbol]: TransientErrorPatch | undefined;
  };
  const isActive = (): boolean => calmHidesTranscriptChrome();
  let patch = registry[TRANSIENT_ERROR_PATCH];

  if (patch) {
    patch.isActive = isActive;
  } else {
    const prototype = AssistantMessageComponent.prototype;
    const renderStock = prototype.render;
    if (typeof renderStock !== "function") {
      throw new Error("Pi Calm requires Pi AssistantMessageComponent.render");
    }

    patch = {
      hiddenKeys: new Set<string>(),
      hiddenObjects: new WeakSet<object>(),
      isActive,
      renderStock,
    };
    const residentPatch = patch;
    prototype.render = function (width: number): string[] {
      const message = (this as unknown as AssistantMessagePresentationState).lastMessage;
      if (
        message &&
        residentPatch.isActive() &&
        messageIsHidden(residentPatch, message)
      ) {
        return [];
      }
      return residentPatch.renderStock.call(this, width);
    };
    registry[TRANSIENT_ERROR_PATCH] = patch;
  }

  const residentPatch = patch;
  return {
    recordRun(messages: readonly unknown[]): void {
      const message = finalAssistant(messages);
      residentPatch.candidate = message;
      if (message?.stopReason === "error") hideMessage(residentPatch, message);
    },
    restore(entries: readonly SessionEntry[]): void {
      restoreFromBranch(residentPatch, entries);
    },
    settle(): void {
      const message = residentPatch.candidate;
      if (message?.stopReason === "error") showMessage(residentPatch, message);
      residentPatch.candidate = undefined;
    },
  };
}
