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

const RUNTIMES: Record<RuntimeId, RuntimeDefinition> = {
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

  const result = await runCommand("pip", ["show", runtime.packageName]);
  const installed = result.exitCode === 0;
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
    output: result.stdout || result.stderr,
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

  if (action === "run") {
    try {
      await fs.access(runtime.configPath);
    } catch (_error) {
      return NextResponse.json(
        { error: "Config non trovato. Salva prima la configurazione dalla home." },
        { status: 400 }
      );
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
