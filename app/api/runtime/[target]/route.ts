import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";

import type { RuntimeId } from "@/lib/runtimes";

import { runtimeManager, type RuntimeDefinition } from "../_manager";

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

type RouteContext = {
  params: Promise<{
    target: string;
  }>;
};

const appRoot = process.cwd();
const projectRoot = appRoot;
const clientRoot = path.join(appRoot, "client");

const CLIENT_PROTOCOLS: Record<
  Extract<RuntimeId, `client-${string}`>,
  {
    directory: string;
    script: string;
    configFile: string;
  }
> = {
  "client-rabbitmq": {
    directory: path.join(clientRoot, "rabbitmq"),
    script: "rabbitmq_client.py",
    configFile: "rabbitmq_use.yaml",
  },
  "client-mqtt": {
    directory: path.join(clientRoot, "mqtt"),
    script: "mqtt_client.py",
    configFile: "mqtt_use.yaml",
  },
  "client-rest": {
    directory: path.join(clientRoot, "rest"),
    script: "rest_client.py",
    configFile: "rest_use.yaml",
  },
};

const CLIENT_RUNTIME_IDS = Object.keys(CLIENT_PROTOCOLS) as Array<
  Extract<RuntimeId, `client-${string}`>
>;

const baseRuntimes: Record<string, RuntimeDefinition> = {
  "simulation-bridge": {
    packageName: "simulation-bridge",
    wheelPath: path.join(projectRoot, "dist", "simulation_bridge-0.1.1-py3-none-any.whl"),
    configPath: path.join(appRoot, "simulation-bridge", "config.yaml"),
    spawnCommand: (configPath) => ({
      command: "simulation-bridge",
      args: ["-c", configPath],
    }),
  },
  "anylogic-agent": {
    packageName: "anylogic-agent",
    wheelPath: path.join(projectRoot, "dist", "anylogic_agent-0.1.0-py3-none-any.whl"),
    configPath: path.join(appRoot, "simulation-bridge", "anylogic-agent", "config.yaml"),
    spawnCommand: (configPath) => ({
      command: "anylogic-agent",
      args: ["--config-file", configPath],
    }),
  },
  "matlab-agent": {
    packageName: "matlab-agent",
    wheelPath: path.join(projectRoot, "dist", "matlab_agent-1.0.0-py3-none-any.whl"),
    configPath: path.join(appRoot, "simulation-bridge", "matlab-agent", "config.yaml"),
    spawnCommand: (configPath) => ({
      command: "matlab-agent",
      args: ["--config-file", configPath],
    }),
  },
};

CLIENT_RUNTIME_IDS.forEach((id) => {
  const info = CLIENT_PROTOCOLS[id];
  const workingDirectory = info.directory;
  const requirementsPath = path.join(workingDirectory, "requirements.txt");
  baseRuntimes[id] = {
    requirementsPath,
    workingDirectory,
    configPath: path.join(workingDirectory, info.configFile),
    spawnCommand: () => ({
      command: "bash",
      args: [
        "-lc",
        ["source venv/bin/activate", `python3 ${info.script}`].join(" && "),
      ],
    }),
  };
});

const RUNTIMES = baseRuntimes as Record<RuntimeId, RuntimeDefinition>;

const getRuntime = (target: string) => {
  return RUNTIMES[target as RuntimeId] ?? null;
};

function runCommand(command: string, args: string[] = [], cwd = projectRoot): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error: Error) => {
      resolve({ exitCode: -1, stdout, stderr: `${stderr}\n${error.message}`.trim() });
    });

    child.on("close", (exitCode: number | null) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { target } = await params;
  const runtime = getRuntime(target);
  if (!runtime) {
    return NextResponse.json({ error: `Target non supportato: ${target}` }, { status: 404 });
  }

  let installed = false;
  let infoOutput = "";

  if (runtime.packageName) {
    const result = await runCommand("pip", ["show", runtime.packageName]);
    installed = result.exitCode === 0;
    infoOutput = result.stdout || result.stderr;
  } else if (runtime.requirementsPath && runtime.workingDirectory) {
    const pythonPath = path.join(runtime.workingDirectory, "venv", "bin", "python");
    try {
      await fs.access(pythonPath);
      installed = true;
      infoOutput = `Virtual environment detected at ${path.dirname(pythonPath)}`;
    } catch (_error) {
      installed = false;
      infoOutput = "Virtual environment not initialized.";
    }
  }

  runtimeManager.setInstalledFlag(target as RuntimeId, installed);

  let configExists = false;
  try {
    await fs.access(runtime.configPath);
    configExists = true;
  } catch (_error) {
    configExists = false;
  }

  const snapshot = runtimeManager.getSnapshot(target as RuntimeId);

  return NextResponse.json({
    installed,
    output: infoOutput,
    configPath: runtime.configPath,
    configExists,
    running: snapshot.running,
    statusMessage: snapshot.statusMessage,
    lastExitCode: snapshot.lastExitCode,
  });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { target } = await params;
  const runtime = getRuntime(target);
  if (!runtime) {
    return NextResponse.json({ error: `Target non supportato: ${target}` }, { status: 404 });
  }

  const body = await request.json();
  const action = body?.action as string | undefined;

  if (!action) {
    return NextResponse.json({ error: "Azione mancante" }, { status: 400 });
  }

  if (action === "init") {
    if (runtime.wheelPath && runtime.packageName) {
      const installResult = await runCommand("pip", ["install", runtime.wheelPath]);
      const success = installResult.exitCode === 0;
      if (success) {
        runtimeManager.setInstalledFlag(target as RuntimeId, true);
      }

      return NextResponse.json({
        success,
        installed: success,
        stdout: installResult.stdout,
        stderr: installResult.stderr,
        exitCode: installResult.exitCode,
      });
    }

    if (runtime.requirementsPath && runtime.workingDirectory) {
      const createVenv = await runCommand(
        "python3",
        ["-m", "venv", "venv"],
        runtime.workingDirectory
      );
      if (createVenv.exitCode !== 0) {
        return NextResponse.json(
          {
            success: false,
            installed: false,
            stdout: createVenv.stdout,
            stderr: createVenv.stderr,
            exitCode: createVenv.exitCode,
          },
          { status: 500 }
        );
      }

      const pipPath = path.join(runtime.workingDirectory, "venv", "bin", "pip");
      const installDeps = await runCommand(
        pipPath,
        ["install", "-r", runtime.requirementsPath],
        runtime.workingDirectory
      );

      const success = installDeps.exitCode === 0;
      if (success) {
        runtimeManager.setInstalledFlag(target as RuntimeId, true);
      }

      return NextResponse.json({
        success,
        installed: success,
        stdout: [createVenv.stdout, installDeps.stdout].filter(Boolean).join("\n"),
        stderr: [createVenv.stderr, installDeps.stderr].filter(Boolean).join("\n"),
        exitCode: installDeps.exitCode,
      });
    }

    return NextResponse.json(
      { error: "Routine di inizializzazione non disponibile per il target selezionato." },
      { status: 400 }
    );
  }

  if (action === "run") {
    try {
      await fs.access(runtime.configPath);
    } catch (_error) {
      return NextResponse.json(
        { error: "Config non trovato. Salva prima la configurazione dalla home." },
        { status: 400 }
      );
    }

    if (CLIENT_RUNTIME_IDS.includes(target as RuntimeId)) {
      const otherClientsRunning = CLIENT_RUNTIME_IDS.some((id) => {
        if (id === target) return false;
        const snapshot = runtimeManager.getSnapshot(id);
        return snapshot.running;
      });

      if (otherClientsRunning) {
        return NextResponse.json(
          {
            error:
              "Un altro client è già in esecuzione. Arrestalo prima di avviarne uno nuovo.",
          },
          { status: 409 }
        );
      }
    }

    const result = runtimeManager.startRuntime(target as RuntimeId, runtime, projectRoot);
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Processo già in esecuzione." }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  }

  if (action === "stop") {
    const result = runtimeManager.stopRuntime(target as RuntimeId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Nessun processo in esecuzione." }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: `Azione non supportata: ${action}` }, { status: 400 });
}
