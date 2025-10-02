import { NextRequest, NextResponse } from "next/server";

import type { RuntimeId } from "@/lib/runtimes";
import { runtimeOrder } from "@/lib/runtimes";

import { runtimeManager } from "../../_manager";

type RouteContext = {
  params: Promise<{
    target: string;
  }>;
};

const isRuntimeId = (value: string): value is RuntimeId => {
  return runtimeOrder.includes(value as RuntimeId);
};

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { target } = await params;
  if (!isRuntimeId(target)) {
    return NextResponse.json({ error: `Target non supportato: ${target}` }, { status: 404 });
  }

  const id: RuntimeId = target;
  let cleanupRef: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}
data: ${JSON.stringify(data)}

`));
      };

      const unsubscribe = runtimeManager.subscribe(id, (event) => {
        send(event.type, event.payload);
      });

      const abortHandler = () => {
        if (cleanupRef) {
          cleanupRef();
        }
        try {
          controller.close();
        } catch (_error) {
          // already closed
        }
      };

      cleanupRef = () => {
        unsubscribe();
        request.signal.removeEventListener("abort", abortHandler);
        cleanupRef = null;
      };

      request.signal.addEventListener("abort", abortHandler);
    },
    cancel() {
      cleanupRef?.();
    }
  });
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
