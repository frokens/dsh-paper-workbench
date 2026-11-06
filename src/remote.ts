import { z } from "zod";
import { createTypertRemoteInfo } from "@deepseek-ai/dsh-typert-protocol/remote-info";
import type {
  RemoteResult,
  RemoteStream,
} from "@deepseek-ai/dsh-typert-protocol";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import { uiRequest, type UiRequest } from "./contracts.js";

const agentCodec = {
  mode: "strict" as const,
  typeSymbol: "@deepseek-ai/dsh-session/types#SessionId",
  create: () => z.string(),
  jsonSchema: { type: "string" },
};
const requestCodec = {
  mode: "strict" as const,
  typeSymbol: "UiRequest",
  create: () => uiRequest,
  jsonSchema: z.toJSONSchema(uiRequest),
};

// DSH owns invocation, lookup, access checks, cancellation and Client mounting.
export const remoteInfo = createTypertRemoteInfo(
  {
    package: "dsh-paper-workbench",
    methods: {
      "paperWorkbench/userAction": {
        service: "paperWorkbench",
        invocation: { kind: "direct" },
        description:
          "Perform a human sidebar action for this task; an owned independent reader can only read its frozen packet.",
        parameters: [
          {
            name: "agent",
            wire: "agentId",
            source: "lookup",
            lookup: "agent",
            codec: agentCodec,
            strictCodec: agentCodec,
          },
          {
            name: "request",
            source: "json",
            codec: requestCodec,
            strictCodec: requestCodec,
          },
        ],
        cancellation: { parameter: "signal" },
        result: {
          mode: "strict",
          typeSymbol: "PaperActionResult",
          create: () => z.json(),
        },
      },
      "paperWorkbench/observe": {
        service: "paperWorkbench",
        mode: "stream",
        invocation: { kind: "direct" },
        description:
          "Observe committed paper state or the owned reader's frozen packet through the DSH Remote stream.",
        parameters: [
          {
            name: "agent",
            wire: "agentId",
            source: "lookup",
            lookup: "agent",
            codec: agentCodec,
            strictCodec: agentCodec,
          },
        ],
        cancellation: { parameter: "signal" },
        result: {
          mode: "strict",
          typeSymbol: "PaperViewState",
          create: () => z.json(),
        },
      },
    },
  },
  z,
);

declare module "@deepseek-ai/dsh-typert-protocol" {
  interface TypertRemoteNamespaceMap {
    paperWorkbench: {
      userAction: (
        agentId: SessionId,
        request: UiRequest,
        signal?: AbortSignal,
      ) => Promise<RemoteResult<unknown>>;
      observe: (
        agentId: SessionId,
        signal?: AbortSignal,
      ) => RemoteStream<unknown>;
    };
  }
}
