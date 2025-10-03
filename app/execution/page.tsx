"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { RuntimeId } from "@/lib/runtimes";
import { runtimeOrder, runtimeUiDefinitions } from "@/lib/runtimes";

import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Textarea } from "@/app/components/ui/textarea";

import { cn } from "@/lib/utils";

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
      };
      return acc;
    },
    {} as Record<RuntimeId, RuntimeUIState>
  );

  const [state, setState] = useState(initialState);

  const agentRuntimeIds = useMemo(
    () => runtimeOrder.filter((id) => id !== "simulation-bridge"),
    []
  );

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

  const renderRuntimeCard = (id: RuntimeId) => {
    const definition = runtimeUiDefinitions[id];
    const runtimeState = state[id];

    return (
      <Card key={id} className="flex h-full flex-col">
        <CardHeader className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>{definition.title}</CardTitle>
              <CardDescription>{definition.description}</CardDescription>
            </div>
            <RuntimeStatusPill runtimeState={runtimeState} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          <div className="flex flex-col gap-1 text-sm text-zinc-500">
            <span>
              <strong>Run command:</strong> {definition.runPreview}
            </span>
            <span>
              <strong>Config:</strong>{" "}
              {runtimeState.configPath ? (
                <code>{runtimeState.configPath}</code>
              ) : (
                <span className="text-amber-600">
                  Please save the configuration file first in the dedicated
                  page.
                </span>
              )}
            </span>
          </div>

          {runtimeState.statusMessage ? (
            <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-foreground">
              {runtimeState.statusMessage}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-500">
            <span>Installed: {runtimeState.isInstalled ? "Yes" : "No"}</span>
            <span>
              Execution status: {runtimeState.running ? "Running" : "Idle"}
            </span>
            {runtimeState.lastExitCode !== null ? (
              <span>Last exit code: {runtimeState.lastExitCode}</span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleInitialization(id)}
              disabled={runtimeState.installing}
            >
              {runtimeState.installing ? "Initializing..." : "Initialize"}
            </Button>
            <Button
              type="button"
              onClick={() => handleRun(id)}
              disabled={!runtimeState.isInstalled || runtimeState.running}
            >
              Start
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleStop(id)}
              disabled={!runtimeState.running}
            >
              Stop
            </Button>
          </div>

          <div className="grid gap-2">
            <LabelledTextarea
              label="Installation log"
              value={runtimeState.installLogs}
            />
            <LabelledTextarea
              label="Execution log"
              value={runtimeState.runLogs}
              placeholder="Execution log"
            />
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[600px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Simulation runtime</h1>
        <p className="text-sm text-zinc-500">
          Control the execution of the Simulation Bridge and connected agents.
        </p>
      </div>

      <div className="grid h-full gap-6 lg:grid-cols-[1.15fr_minmax(0,1fr)]">
        {/* Left column */}
        <div className="flex h-full flex-col gap-4">
          {renderRuntimeCard("simulation-bridge")}
        </div>

        {/* Right column */}
        <div className="grid h-full auto-rows-fr gap-4">
          {agentRuntimeIds.map((runtimeId) => renderRuntimeCard(runtimeId))}
        </div>
      </div>

      <div className="mt-4 text-xs text-zinc-500">
        Need to edit configurations? Go to{" "}
        <Link className="underline" href="/config/simulation-bridge">
          Configuration
        </Link>
        .
      </div>
    </div>
  );
}

function LabelledTextarea({
  label,
  value,
  placeholder,
}: {
  label: string;
  value: string;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-2">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <Textarea
        value={value}
        readOnly
        placeholder={placeholder}
        className="min-h-[250px] font-mono text-xs"
      />
    </div>
  );
}

function RuntimeStatusPill({
  runtimeState,
}: {
  runtimeState: RuntimeUIState;
}) {
  const status = getRuntimeStatus(runtimeState);

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
        status.pillClass
      )}
    >
      <span
        aria-hidden
        className={cn("h-2 w-2 rounded-full", status.indicatorClass)}
      />
      <span>{status.label}</span>
    </div>
  );
}

function getRuntimeStatus(runtimeState: RuntimeUIState) {
  if (runtimeState.installing) {
    return {
      label: "Installing",
      pillClass: "border-amber-200 bg-amber-50 text-amber-600",
      indicatorClass: "bg-amber-500",
    };
  }

  if (runtimeState.running) {
    return {
      label: "Running",
      pillClass: "border-emerald-200 bg-emerald-50 text-emerald-600",
      indicatorClass: "bg-emerald-500",
    };
  }

  if (runtimeState.lastExitCode !== null && runtimeState.lastExitCode !== 0) {
    return {
      label: "Error",
      pillClass: "border-rose-200 bg-rose-50 text-rose-600",
      indicatorClass: "bg-rose-500",
    };
  }

  if (!runtimeState.isInstalled) {
    return {
      label: "Not installed",
      pillClass: "border-zinc-200 bg-zinc-50 text-zinc-600",
      indicatorClass: "bg-zinc-400",
    };
  }

  if (runtimeState.lastExitCode === 0) {
    return {
      label: "Completed",
      pillClass: "border-sky-200 bg-sky-50 text-sky-600",
      indicatorClass: "bg-sky-500",
    };
  }

  return {
    label: "Idle",
    pillClass: "border-slate-200 bg-slate-50 text-slate-600",
    indicatorClass: "bg-slate-400",
  };
}
