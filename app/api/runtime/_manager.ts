import { spawn } from "child_process";
import type { ChildProcessWithoutNullStreams } from "child_process";

import type { RuntimeId } from "@/lib/runtimes";

export interface RuntimeDefinition {
  packageName: string;
  wheelPath: string;
  configPath: string;
  spawnCommand: (configPath: string) => { command: string; args: string[] };
}

export interface RuntimeLogEntry {
  id: number;
  source: "stdout" | "stderr" | "system";
  chunk: string;
  timestamp: number;
}

export interface RuntimeSnapshot {
  logs: RuntimeLogEntry[];
  running: boolean;
  installed: boolean;
  statusMessage: string;
  lastExitCode: number | null;
}

export type RuntimeEvent =
  | { type: "snapshot"; payload: RuntimeSnapshot }
  | { type: "log"; payload: RuntimeLogEntry }
  | { type: "status"; payload: { message: string } }
  | { type: "exit"; payload: { exitCode: number | null } }
  | { type: "start"; payload: { pid: number | null } };

type RuntimeWatcher = (event: RuntimeEvent) => void;

interface RuntimeState {
  process: ChildProcessWithoutNullStreams | null;
  logs: RuntimeLogEntry[];
  watchers: Set<RuntimeWatcher>;
  running: boolean;
  installed: boolean;
  statusMessage: string;
  lastExitCode: number | null;
}

const LOG_LIMIT = 1000;

class RuntimeManager {
  private states = new Map<RuntimeId, RuntimeState>();
  private logCounter = 0;

  private ensureState(id: RuntimeId): RuntimeState {
    let state = this.states.get(id);
    if (!state) {
      state = {
        process: null,
        logs: [],
        watchers: new Set(),
        running: false,
        installed: false,
        statusMessage: "",
        lastExitCode: null
      };
      this.states.set(id, state);
    }
    return state;
  }

  getSnapshot(id: RuntimeId): RuntimeSnapshot {
    const state = this.ensureState(id);
    return {
      logs: state.logs.slice(),
      running: state.running,
      installed: state.installed,
      statusMessage: state.statusMessage,
      lastExitCode: state.lastExitCode
    };
  }

  setInstalledFlag(id: RuntimeId, installed: boolean) {
    const state = this.ensureState(id);
    if (state.installed !== installed) {
      state.installed = installed;
      this.emitEvent(id, { type: "snapshot", payload: this.getSnapshot(id) });
      this.emitStatus(id, installed ? "Pacchetto installato." : "Pacchetto non installato.");
    }
  }

  subscribe(id: RuntimeId, watcher: RuntimeWatcher): () => void {
    const state = this.ensureState(id);
    state.watchers.add(watcher);
    watcher({ type: "snapshot", payload: this.getSnapshot(id) });
    return () => {
      state.watchers.delete(watcher);
    };
  }

  private appendLog(id: RuntimeId, entry: Omit<RuntimeLogEntry, "id" | "timestamp"> & { timestamp?: number }) {
    const state = this.ensureState(id);
    const logEntry: RuntimeLogEntry = {
      id: ++this.logCounter,
      source: entry.source,
      chunk: entry.chunk,
      timestamp: entry.timestamp ?? Date.now()
    };
    state.logs.push(logEntry);
    if (state.logs.length > LOG_LIMIT) {
      state.logs.splice(0, state.logs.length - LOG_LIMIT);
    }
    this.emitEvent(id, { type: "log", payload: logEntry });
  }

  private emitStatus(id: RuntimeId, message: string) {
    const state = this.ensureState(id);
    state.statusMessage = message;
    this.emitEvent(id, { type: "status", payload: { message } });
  }

  private emitEvent(id: RuntimeId, event: RuntimeEvent) {
    const state = this.ensureState(id);
    state.watchers.forEach((watcher) => {
      try {
        watcher(event);
      } catch (error) {
        console.error("Watcher error", error);
      }
    });
  }

  startRuntime(id: RuntimeId, runtime: RuntimeDefinition, cwd: string) {
    const state = this.ensureState(id);
    if (state.process) {
      return { ok: false, error: "Processo già in esecuzione." };
    }

    const { command, args } = runtime.spawnCommand(runtime.configPath);

    try {
      const child = spawn(command, args, {
        cwd,
        env: process.env,
        shell: true
      });

      state.process = child;
      state.running = true;
      state.lastExitCode = null;
      this.emitEvent(id, { type: "snapshot", payload: this.getSnapshot(id) });

      this.appendLog(id, {
        source: "system",
        chunk: `Esecuzione avviata: ${command} ${args.join(" ")}`
      });
      this.emitStatus(id, "Processo avviato");
      this.emitEvent(id, { type: "start", payload: { pid: child.pid ?? null } });

      child.stdout.on("data", (chunk: Buffer) => {
        this.appendLog(id, { source: "stdout", chunk: chunk.toString() });
      });

      child.stderr.on("data", (chunk: Buffer) => {
        this.appendLog(id, { source: "stderr", chunk: chunk.toString() });
      });

      child.on("error", (error: Error) => {
        this.appendLog(id, { source: "system", chunk: `Errore processo: ${error.message}` });
        this.emitStatus(id, "Errore durante l'esecuzione del processo.");
      });

      child.on("close", (exitCode: number | null) => {
        state.running = false;
        state.process = null;
        state.lastExitCode = exitCode;
        this.appendLog(id, {
          source: "system",
          chunk: `Processo terminato con codice ${exitCode ?? "null"}`
        });
        this.emitStatus(id, exitCode === 0 ? "Esecuzione completata." : "Processo terminato con errori.");
        this.emitEvent(id, { type: "exit", payload: { exitCode } });
        this.emitEvent(id, { type: "snapshot", payload: this.getSnapshot(id) });
      });

      return { ok: true };
    } catch (error) {
      this.appendLog(id, {
        source: "system",
        chunk: `Impossibile avviare il processo: ${(error as Error).message}`
      });
      this.emitStatus(id, "Avvio fallito");
      state.process = null;
      state.running = false;
      return { ok: false, error: "Impossibile avviare il processo." };
    }
  }

  stopRuntime(id: RuntimeId) {
    const state = this.ensureState(id);
    const child = state.process;
    if (!child || !state.running) {
      return { ok: false, error: "Nessun processo in esecuzione." };
    }

    this.appendLog(id, { source: "system", chunk: "Richiesta interruzione (SIGINT)..." });
    this.emitStatus(id, "Interruzione in corso...");

    const killed = child.kill("SIGINT");
    if (!killed) {
      this.appendLog(id, { source: "system", chunk: "Impossibile inviare SIGINT. Tentativo di SIGTERM." });
      child.kill("SIGTERM");
    }

    setTimeout(() => {
      if (state.process === child && state.running) {
        this.appendLog(id, { source: "system", chunk: "Forzo l'arresto con SIGKILL." });
        child.kill("SIGKILL");
      }
    }, 5000).unref?.();

    return { ok: true };
  }
}

const globalRef = globalThis as unknown as { __runtimeManager?: RuntimeManager };
if (!globalRef.__runtimeManager) {
  globalRef.__runtimeManager = new RuntimeManager();
}

export const runtimeManager = globalRef.__runtimeManager;
