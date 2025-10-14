"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import type { RuntimeId } from "@/lib/runtimes";
import { runtimeUiDefinitions } from "@/lib/runtimes";
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

type Protocol = "http" | "mqtt";

const runtimeId: RuntimeId = "mockpt";
const configFiles: Record<Protocol, string> = {
  http: "MockPT/conf/http_simulation_config.yaml",
  mqtt: "MockPT/conf/mqtt_simulation_config.yaml",
};

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
  configPath: string;
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
      label: "Not initialized",
      textClass: "text-zinc-500",
    } as const;
  }

  return {
    colorClass: "bg-gray-400",
    label: "Idle",
    textClass: "text-zinc-500",
  } as const;
};

const detectProtocolFromPath = (configPath: string): Protocol | null => {
  if (!configPath) return null;
  if (configPath.endsWith("mqtt_simulation_config.yaml")) return "mqtt";
  if (configPath.endsWith("http_simulation_config.yaml")) return "http";
  return null;
};

export default function MockPtExecutionPage() {
  const definition = runtimeUiDefinitions[runtimeId];
  const [runtimeState, setRuntimeState] = useState<RuntimeUIState>({
    isInstalled: false,
    installing: false,
    running: false,
    runLogs: "",
    installLogs: "",
    statusMessage: "",
    configPath: "",
    lastExitCode: null,
    showInstallLogs: false,
  });
  const [configExists, setConfigExists] = useState(false);
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol>("http");
  const [lastRunProtocol, setLastRunProtocol] = useState<Protocol | null>(null);
  const runLogRef = useRef<HTMLTextAreaElement>(null);
  const installLogRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const response = await fetch(`/api/runtime/${runtimeId}`);
        if (!response.ok) return;
        const data = await response.json();

        setRuntimeState((current) => ({
          ...current,
          isInstalled: Boolean(data.installed),
          installing: false,
          running: Boolean(data.running),
          statusMessage:
            typeof data.statusMessage === "string"
              ? data.statusMessage
              : current.statusMessage,
          configPath:
            typeof data.configPath === "string"
              ? data.configPath
              : current.configPath,
          lastExitCode:
            typeof data.lastExitCode === "number"
              ? data.lastExitCode
              : current.lastExitCode,
          installLogs:
            typeof data.output === "string" && data.output.length > 0
              ? data.output
              : current.installLogs,
        }));

        setConfigExists(Boolean(data.configExists));
        const detected = detectProtocolFromPath(String(data.configPath ?? ""));
        if (detected) {
          setLastRunProtocol(detected);
          setSelectedProtocol(detected);
        }
      } catch (error) {
        console.error("Unable to load MockPT status", error);
      }
    };

    loadStatus();
  }, []);

  useEffect(() => {
    const es = new EventSource(`/api/runtime/${runtimeId}/events`);

    es.addEventListener("snapshot", (event) => {
      const payload = JSON.parse(event.data) as RuntimeSnapshot;
      setRuntimeState((current) => ({
        ...current,
        runLogs: reduceLogs(payload.logs),
        running: payload.running,
        isInstalled: payload.installed,
        statusMessage: payload.statusMessage,
        lastExitCode: payload.lastExitCode,
        configPath:
          payload.configPath && payload.configPath.length > 0
            ? payload.configPath
            : current.configPath,
      }));

      const detected = detectProtocolFromPath(payload.configPath);
      if (detected) {
        setLastRunProtocol(detected);
      }
    });

    es.addEventListener("log", (event) => {
      const entry = JSON.parse(event.data) as RuntimeLogEntry;
      setRuntimeState((current) => ({
        ...current,
        runLogs: current.runLogs + formatLogEntry(entry),
      }));
    });

    es.addEventListener("status", (event) => {
      const data = JSON.parse(event.data) as { message?: string };
      if (typeof data.message === "string" && data.message.length > 0) {
        setRuntimeState((current) => ({
          ...current,
          statusMessage: data.message!,
        }));
      }
    });

    es.addEventListener("start", () => {
      setRuntimeState((current) => ({
        ...current,
        running: true,
      }));
    });

    es.addEventListener("exit", (event) => {
      const data = JSON.parse(event.data) as { exitCode: number | null };
      setRuntimeState((current) => ({
        ...current,
        running: false,
        lastExitCode: data.exitCode ?? null,
      }));
    });

    return () => {
      es.close();
    };
  }, []);

  useEffect(() => {
    if (runLogRef.current) {
      runLogRef.current.scrollTop = runLogRef.current.scrollHeight;
    }
  }, [runtimeState.runLogs]);

  useEffect(() => {
    if (runtimeState.showInstallLogs && installLogRef.current) {
      installLogRef.current.scrollTop = installLogRef.current.scrollHeight;
    }
  }, [runtimeState.installLogs, runtimeState.showInstallLogs]);

  const status = getRuntimeStatus(runtimeState);
  const selectedConfigPath = useMemo(
    () => configFiles[selectedProtocol],
    [selectedProtocol]
  );

  const handleInitialization = async () => {
    setRuntimeState((current) => ({
      ...current,
      installing: true,
      statusMessage: "Setting up the virtual environment...",
    }));

    try {
      const response = await fetch(`/api/runtime/${runtimeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "init" }),
      });

      const data = await response.json().catch(() => ({}));
      const logs = joinOutputs(data.stdout, data.stderr);
      const success = Boolean(response.ok && data.success);

      setRuntimeState((current) => ({
        ...current,
        installing: false,
        isInstalled: success ? true : current.isInstalled,
        installLogs: logs || current.installLogs,
        statusMessage: success
          ? "MockPT initialized successfully."
          : data.error ??
            "Initialization failed. Check the logs for details.",
      }));
    } catch (error) {
      console.error("Error initializing MockPT", error);
      setRuntimeState((current) => ({
        ...current,
        installing: false,
        statusMessage: "Network error during initialization.",
      }));
    }
  };

  const handleRun = async () => {
    setRuntimeState((current) => ({
      ...current,
      statusMessage: "Starting...",
    }));

    try {
      const response = await fetch(`/api/runtime/${runtimeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run",
          configPath: selectedConfigPath,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setRuntimeState((current) => ({
          ...current,
          statusMessage:
            data.error ??
            "Start failed. Make sure the configuration file is available.",
        }));
        return;
      }

      if (typeof data.configPath === "string" && data.configPath.length > 0) {
        setRuntimeState((current) => ({
          ...current,
          configPath: data.configPath,
        }));
        const detected = detectProtocolFromPath(data.configPath);
        if (detected) {
          setLastRunProtocol(detected);
        }
      }
      setConfigExists(true);
    } catch (error) {
      console.error("Error starting MockPT", error);
      setRuntimeState((current) => ({
        ...current,
        statusMessage: "Network error while starting.",
      }));
    }
  };

  const handleStop = async () => {
    setRuntimeState((current) => ({
      ...current,
      statusMessage: "Stop requested...",
    }));

    try {
      const response = await fetch(`/api/runtime/${runtimeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRuntimeState((current) => ({
          ...current,
          statusMessage: data.error ?? "Unable to stop the process.",
        }));
      }
    } catch (error) {
      console.error("Error stopping MockPT", error);
      setRuntimeState((current) => ({
        ...current,
        statusMessage: "Network error while stopping.",
      }));
    }
  };

  const toggleInstallLogs = () => {
    setRuntimeState((current) => ({
      ...current,
      showInstallLogs: !current.showInstallLogs,
    }));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Mock Physical Twin</h1>
        <p className="text-sm text-zinc-500">
          Initialize the MockPT virtual environment and launch{" "}
          <code>physical_twin_emulator.py</code> with the configuration you prefer.
        </p>
        <p className="text-sm text-zinc-500">
          Manage the templates under{" "}
          <Link className="text-primary underline" href="/config/mockpt">
            Config &gt; MockPT
          </Link>
          .
        </p>
      </div>

      <Card className="flex flex-col overflow-hidden">
        <CardHeader className="flex flex-col gap-4 space-y-0 border-b border-zinc-100 p-6 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl font-semibold">
              {definition.title}
            </CardTitle>
            <CardDescription className="text-sm text-zinc-500">
              {definition.description}
            </CardDescription>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm font-medium">
            <span
              className={cn("h-2.5 w-2.5 rounded-full", status.colorClass)}
            />
            <span className={cn("text-sm font-semibold", status.textClass)}>
              {status.label}
            </span>
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-5 p-6">
          <div className="grid gap-3 text-sm text-zinc-600 md:grid-cols-2">
            <div className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Install command
              </span>
              <code className="rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700">
                {definition.installHint}
              </code>
            </div>
            <div className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Run command
              </span>
              <code className="rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700">
                python physical_twin_emulator.py -c &lt;config.yaml&gt;
              </code>
            </div>
          </div>

          <div className="grid gap-2">
            <span className="text-xs font-semibold uppercase text-zinc-500">
              Configurations
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={selectedProtocol === "http" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedProtocol("http")}
              >
                HTTP
              </Button>
              <Button
                type="button"
                variant={selectedProtocol === "mqtt" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedProtocol("mqtt")}
              >
                MQTT
              </Button>
            </div>
            <div className="grid gap-1.5 text-xs text-zinc-600">
              <div>
                <span className="font-semibold text-zinc-700">
                  Next run:
                </span>{" "}
                <code>{selectedConfigPath}</code>
              </div>
              <div>
                <span className="font-semibold text-zinc-700">
                  Last executed:
                </span>{" "}
                {runtimeState.configPath ? (
                  <code>{runtimeState.configPath}</code>
                ) : (
                  <span className="text-amber-600">Not available yet</span>
                )}
              </div>
              <div>
                <span className="font-semibold text-zinc-700">
                  Last file status:
                </span>{" "}
                {configExists ? (
                  <span className="text-green-600">Found</span>
                ) : (
                  <span className="text-amber-600">
                    Not found. Save the matching template.
                  </span>
                )}
              </div>
            </div>
          </div>

          {runtimeState.statusMessage ? (
            <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 shadow-sm">
              {runtimeState.statusMessage}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-600">
            <span className="rounded-full bg-zinc-100 px-3 py-1">
              Virtual env: {runtimeState.isInstalled ? "Ready" : "Needs setup"}
            </span>
            <span className="rounded-full bg-zinc-100 px-3 py-1">
              Execution: {runtimeState.running ? "Running" : "Stopped"}
            </span>
            {runtimeState.lastExitCode !== null ? (
              <span className="rounded-full bg-zinc-100 px-3 py-1">
                Exit code: {runtimeState.lastExitCode}
              </span>
            ) : null}
            {lastRunProtocol ? (
              <span className="rounded-full bg-zinc-100 px-3 py-1">
                Last protocol: {lastRunProtocol.toUpperCase()}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleInitialization}
              disabled={runtimeState.installing}
              className="flex-1 sm:flex-none"
            >
              {runtimeState.installing ? "Initializing..." : "Initialize"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleRun}
              disabled={!runtimeState.isInstalled || runtimeState.running}
              className="flex-1 sm:flex-none"
            >
              Start
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleStop}
              disabled={!runtimeState.running}
              className="flex-1 sm:flex-none"
            >
              Stop
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-zinc-500">
                Installation log
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={toggleInstallLogs}
                disabled={!runtimeState.installLogs.trim().length}
              >
                {runtimeState.showInstallLogs ? "Hide" : "Show"}
              </Button>
            </div>
            {runtimeState.showInstallLogs ? (
              <Textarea
                ref={installLogRef}
                value={runtimeState.installLogs}
                readOnly
                className="h-40 min-h-0 resize-none font-mono text-xs leading-relaxed text-zinc-700"
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase text-zinc-500">
              Execution log
            </p>
            <Textarea
              ref={runLogRef}
              value={runtimeState.runLogs}
              readOnly
              className="h-72 min-h-0 resize-none font-mono text-xs leading-relaxed text-zinc-700"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
