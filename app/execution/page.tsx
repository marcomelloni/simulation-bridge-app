"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import type { RuntimeId, RuntimeUiDefinition } from "@/lib/runtimes";
import { runtimeOrder, runtimeUiDefinitions } from "@/lib/runtimes";
import { cn } from "@/lib/utils";

import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Textarea } from "@/app/components/ui/textarea";

interface RuntimeLogEntry {
  id: number;
  source: "stdout" | "stderr" | "system";
  chunk: string;
  timestamp: number;
}

interface RuntimeSnapshot {
  logs: RuntimeLogEntry[];
  running: boolean;
  installed: boolean;
  statusMessage: string;
  lastExitCode: number | null;
}

interface RuntimeUIState {
  isInstalled: boolean;
  installing: boolean;
  running: boolean;
  runLogs: string;
  installLogs: string;
  statusMessage: string;
  configPath: string;
  lastExitCode: number | null;
  showInstallLogs: boolean;
}

const formatLogEntry = (entry: RuntimeLogEntry) => {
  const time = new Date(entry.timestamp).toLocaleTimeString();
  const sourceLabel = entry.source === "system" ? "system" : entry.source;
  const prefix = `[${time}] [${sourceLabel}] `;
  const chunk = entry.chunk.endsWith("\n") ? entry.chunk : `${entry.chunk}\n`;
  return `${prefix}${chunk}`;
};

const reduceLogs = (logs: RuntimeLogEntry[]) =>
  logs.map(formatLogEntry).join("");

const joinOutputs = (stdout?: string, stderr?: string) =>
  [stdout, stderr]
    .filter(
      (section): section is string => !!section && section.trim().length > 0
    )
    .join("\n\n");

const getRuntimeStatus = (runtimeState: RuntimeUIState) => {
  if (runtimeState.running) {
    return {
      colorClass: "bg-green-500",
      label: "Running",
      textClass: "text-green-600",
    } as const;
  }

  if (runtimeState.lastExitCode !== null && runtimeState.lastExitCode !== 0) {
    return {
      colorClass: "bg-red-500",
      label: `Error (code ${runtimeState.lastExitCode})`,
      textClass: "text-red-600",
    } as const;
  }

  if (!runtimeState.isInstalled) {
    return {
      colorClass: "bg-gray-400",
      label: "Not installed",
      textClass: "text-zinc-500",
    } as const;
  }

  return {
    colorClass: "bg-gray-400",
    label: "Idle",
    textClass: "text-zinc-500",
  } as const;
};

export default function ExecutionPage() {
  const initialState = runtimeOrder.reduce<Record<RuntimeId, RuntimeUIState>>(
    (acc, id) => {
      acc[id] = {
        isInstalled: false,
        installing: false,
        running: false,
        runLogs: "",
        installLogs: "",
        statusMessage: "",
        configPath: "",
        lastExitCode: null,
        showInstallLogs: false,
      };
      return acc;
    },
    {} as Record<RuntimeId, RuntimeUIState>
  );

  const [state, setState] = useState(initialState);

  const setRuntimeState = (
    id: RuntimeId,
    updater: (current: RuntimeUIState) => RuntimeUIState
  ) => {
    setState((prev) => ({
      ...prev,
      [id]: updater(prev[id]),
    }));
  };

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const responses = await Promise.all(
          runtimeOrder.map((id) => fetch(`/api/runtime/${id}`))
        );

        const payloads = await Promise.all(
          responses.map(async (response) => {
            if (!response.ok) return null;
            try {
              return await response.json();
            } catch (_error) {
              return null;
            }
          })
        );

        runtimeOrder.forEach((id, index) => {
          const response = responses[index];
          const data = payloads[index];

          if (!response.ok || !data) {
            setRuntimeState(id, (current) => ({
              ...current,
              statusMessage:
                current.statusMessage || "Unable to retrieve initial status.",
            }));
            return;
          }

          setRuntimeState(id, (current) => ({
            ...current,
            isInstalled: Boolean(data.installed),
            installing: false,
            running: Boolean(data.running),
            statusMessage: data.statusMessage ?? current.statusMessage,
            configPath:
              typeof data.configPath === "string" && data.configPath.length > 0
                ? data.configPath
                : current.configPath,
            lastExitCode:
              data.lastExitCode !== undefined
                ? data.lastExitCode
                : current.lastExitCode,
            installLogs: data.output ?? current.installLogs,
          }));
        });
      } catch (error) {
        console.error("Error loading initial status", error);
      }
    };

    loadStatus();
  }, []);

  useEffect(() => {
    const sources = runtimeOrder.map((id) => {
      const es = new EventSource(`/api/runtime/${id}/events`);

      es.addEventListener("snapshot", (event) => {
        const payload = JSON.parse(event.data) as RuntimeSnapshot;
        setRuntimeState(id, (current) => ({
          ...current,
          runLogs: reduceLogs(payload.logs),
          running: payload.running,
          isInstalled: payload.installed,
          statusMessage: payload.statusMessage,
          lastExitCode: payload.lastExitCode,
        }));
      });

      es.addEventListener("log", (event) => {
        const entry = JSON.parse(event.data) as RuntimeLogEntry;
        setRuntimeState(id, (current) => ({
          ...current,
          runLogs: current.runLogs + formatLogEntry(entry),
        }));
      });

      es.addEventListener("status", (event) => {
        const data = JSON.parse(event.data) as { message?: string };
        if (typeof data.message === "string" && data.message.length > 0) {
          setRuntimeState(id, (current) => ({
            ...current,
            statusMessage: data.message!,
          }));
        }
      });

      es.addEventListener("start", () => {
        setRuntimeState(id, (current) => ({
          ...current,
          running: true,
        }));
      });

      es.addEventListener("exit", (event) => {
        const data = JSON.parse(event.data) as { exitCode: number | null };
        setRuntimeState(id, (current) => ({
          ...current,
          running: false,
          lastExitCode: data.exitCode ?? null,
        }));
      });

      return es;
    });

    return () => {
      sources.forEach((source) => source.close());
    };
  }, []);

  const handleInitialization = async (id: RuntimeId) => {
    setRuntimeState(id, (current) => ({
      ...current,
      installing: true,
      statusMessage: "Installation in progress...",
    }));

    try {
      const response = await fetch(`/api/runtime/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "init" }),
      });

      const data = await response.json().catch(() => ({}));
      const logs = joinOutputs(data.stdout, data.stderr);

      setRuntimeState(id, (current) => ({
        ...current,
        installing: false,
        isInstalled: Boolean(response.ok && data.success),
        installLogs: logs || current.installLogs,
        statusMessage:
          response.ok && data.success
            ? `${runtimeUiDefinitions[id].title} installed successfully.`
            : data.error ??
              "Installation failed. Check the logs for more details.",
      }));
    } catch (error) {
      console.error(`Error installing ${id}`, error);
      setRuntimeState(id, (current) => ({
        ...current,
        installing: false,
        statusMessage: "Network error during installation.",
      }));
    }
  };

  const handleRun = async (id: RuntimeId) => {
    setRuntimeState(id, (current) => ({
      ...current,
      statusMessage: "Starting...",
    }));

    try {
      const response = await fetch(`/api/runtime/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setRuntimeState(id, (current) => ({
          ...current,
          statusMessage:
            data.error ??
            "Start failed. Make sure the configuration file is present.",
        }));
      }
    } catch (error) {
      console.error(`Error starting ${id}`, error);
      setRuntimeState(id, (current) => ({
        ...current,
        statusMessage: "Network error while starting the process.",
      }));
    }
  };

  const handleStop = async (id: RuntimeId) => {
    setRuntimeState(id, (current) => ({
      ...current,
      statusMessage: "Stop requested...",
    }));

    try {
      const response = await fetch(`/api/runtime/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setRuntimeState(id, (current) => ({
          ...current,
          statusMessage: data.error ?? "Unable to stop the process.",
        }));
      }
    } catch (error) {
      console.error(`Error stopping ${id}`, error);
      setRuntimeState(id, (current) => ({
        ...current,
        statusMessage: "Network error while stopping.",
      }));
    }
  };

  const toggleInstallLogs = (id: RuntimeId) => {
    setRuntimeState(id, (current) => ({
      ...current,
      showInstallLogs: !current.showInstallLogs,
    }));
  };

  return (
    <div className="flex h-[90vh] flex-col overflow-hidden bg-zinc-50">
      <main className="flex flex-1 min-h-0 overflow-hidden px-6 py-6">
        <div className="grid flex-1 min-h-0 h-full grid-rows-[repeat(2,minmax(0,1fr))] overflow-hidden lg:grid-cols-2 lg:grid-rows-1 lg:gap-6">
          <section className="flex h-full min-h-0 flex-col overflow-y-auto pr-0 lg:pr-3">
            <div className="flex h-full min-h-0 flex-col">
              <RuntimeCard
                id="simulation-bridge"
                runtimeState={state["simulation-bridge"]}
                definition={runtimeUiDefinitions["simulation-bridge"]}
                onInitialize={handleInitialization}
                onRun={handleRun}
                onStop={handleStop}
                onToggleInstallLogs={toggleInstallLogs}
              />
            </div>
          </section>
          <section className="grid h-full min-h-0 grid-rows-2 gap-4 pl-0 lg:pl-3">
            <div className="flex min-h-0 flex-col overflow-hidden">
              <RuntimeCard
                id="anylogic-agent"
                runtimeState={state["anylogic-agent"]}
                definition={runtimeUiDefinitions["anylogic-agent"]}
                onInitialize={handleInitialization}
                onRun={handleRun}
                onStop={handleStop}
                onToggleInstallLogs={toggleInstallLogs}
              />
            </div>
            <div className="flex min-h-0 flex-col overflow-hidden">
              <RuntimeCard
                id="matlab-agent"
                runtimeState={state["matlab-agent"]}
                definition={runtimeUiDefinitions["matlab-agent"]}
                onInitialize={handleInitialization}
                onRun={handleRun}
                onStop={handleStop}
                onToggleInstallLogs={toggleInstallLogs}
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function RuntimeCard({
  id,
  runtimeState,
  definition,
  onInitialize,
  onRun,
  onStop,
  onToggleInstallLogs,
}: {
  id: RuntimeId;
  runtimeState: RuntimeUIState;
  definition: RuntimeUiDefinition;
  onInitialize: (id: RuntimeId) => void;
  onRun: (id: RuntimeId) => void;
  onStop: (id: RuntimeId) => void;
  onToggleInstallLogs: (id: RuntimeId) => void;
}) {
  const status = getRuntimeStatus(runtimeState);
  const hasInstallLogs = runtimeState.installLogs.trim().length > 0;
  const isInstallLogOpen = runtimeState.showInstallLogs && hasInstallLogs;
  const runLogRef = useRef<HTMLTextAreaElement>(null);
  const installLogRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (runLogRef.current) {
      runLogRef.current.scrollTop = runLogRef.current.scrollHeight;
    }
  }, [runtimeState.runLogs]);

  useEffect(() => {
    if (isInstallLogOpen && installLogRef.current) {
      installLogRef.current.scrollTop = installLogRef.current.scrollHeight;
    }
  }, [runtimeState.installLogs, isInstallLogOpen]);

  return (
    <Card className="flex h-full flex-col overflow-hidden bg-white/95">
      <CardHeader className="flex flex-col gap-4 space-y-0 border-b border-zinc-100 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-xl font-semibold">
            {definition.title}
          </CardTitle>
          <CardDescription className="text-sm text-zinc-500">
            {definition.description}
          </CardDescription>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm font-medium">
          <span className={cn("h-2.5 w-2.5 rounded-full", status.colorClass)} />
          <span className={cn("text-sm font-semibold", status.textClass)}>
            {status.label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
        <div className="grid gap-3 text-sm text-zinc-600">
          <div className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase text-zinc-500">
              Run command
            </span>
            <code className="rounded-md bg-zinc-100 px-3 py-2 font-mono text-xs text-zinc-700">
              {definition.runPreview}
            </code>
          </div>
          <div className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase text-zinc-500">
              Config
            </span>
            {runtimeState.configPath ? (
              <code className="rounded-md bg-zinc-100 px-3 py-2 font-mono text-xs text-zinc-700">
                {runtimeState.configPath}
              </code>
            ) : (
              <span className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Please save the configuration file first in the dedicated page.
              </span>
            )}
          </div>
        </div>

        {runtimeState.statusMessage ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            {runtimeState.statusMessage}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-600">
          <span className="rounded-full bg-zinc-100 px-3 py-1">
            Installed: {runtimeState.isInstalled ? "Yes" : "No"}
          </span>
          <span className="rounded-full bg-zinc-100 px-3 py-1">
            Execution: {runtimeState.running ? "Running" : "Idle"}
          </span>
          {runtimeState.lastExitCode !== null ? (
            <span className="rounded-full bg-zinc-100 px-3 py-1">
              Last exit code: {runtimeState.lastExitCode}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onInitialize(id)}
            disabled={runtimeState.installing}
            className="flex-1 sm:flex-none"
          >
            {runtimeState.installing ? "Initializing..." : "Initialize"}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => onRun(id)}
            disabled={!runtimeState.isInstalled || runtimeState.running}
            className="flex-1 sm:flex-none"
          >
            Start
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onStop(id)}
            disabled={!runtimeState.running}
            className="flex-1 sm:flex-none"
          >
            Stop
          </Button>
        </div>
        <LabelledTextarea
          label="Execution log"
          value={runtimeState.runLogs}
          className="flex-1"
          textareaClassName="flex-1"
          textareaRef={runLogRef}
        />
      </CardContent>
    </Card>
  );
}

function LabelledTextarea({
  label,
  value,
  placeholder,
  className,
  textareaClassName,
  textareaRef,
}: {
  label: string;
  value: string;
  placeholder?: string;
  className?: string;
  textareaClassName?: string;
  textareaRef?: RefObject<HTMLTextAreaElement>;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
      <Textarea
        ref={textareaRef}
        value={value}
        readOnly
        placeholder={placeholder}
        className={cn(
          "flex-1 min-h-0 resize-none font-mono text-xs leading-relaxed text-zinc-700",
          textareaClassName
        )}
      />
    </div>
  );
}
