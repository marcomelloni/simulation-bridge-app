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
const mockPtBaseDir = path.join(projectRoot, "MockPT");
const mockPtConfDir = path.join(mockPtBaseDir, "conf");
const mockPtDefaultConfig = path.join(
  mockPtConfDir,
  "http_simulation_config.yaml"
);
const mockPtScriptPath = path.join(
  mockPtBaseDir,
  "app",
  "physical_twin_emulator.py"
);
const mockPtVenvDir = path.join(mockPtBaseDir, ".venv");
const mockPtRequirementsPath = path.join(mockPtBaseDir, "requirements.txt");
const getMockPtPythonPath = () => {
  if (process.platform === "win32") {
    return path.join(mockPtVenvDir, "Scripts", "python.exe");
  }
  return path.join(mockPtVenvDir, "bin", "python");
};

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
  mockpt: {
    configPath: mockPtDefaultConfig,
    spawnCommand: (configPath) => ({
      command: getMockPtPythonPath(),
      args: [mockPtScriptPath, "-c", configPath],
      cwd: path.join(mockPtBaseDir, "app"),
    }),
  },
};

const getRuntime = (target: string) => {
  return RUNTIMES[target as RuntimeId] ?? null;
};

const fileExists = async (filePath: string) => {
  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
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
    return NextResponse.json({ error: `Unsupported target: ${target}` }, { status: 404 });
  }

  let installed = false;
  let output = "";

  if (target === "mockpt") {
    installed = await fileExists(getMockPtPythonPath());
    runtimeManager.setInstalledFlag(target as RuntimeId, installed);
    output = installed
      ? `Virtual environment ready at ${getMockPtPythonPath()}`
      : `Virtual environment not initialized. Run Initialize to create ${mockPtVenvDir}.`;
  } else if (runtime.packageName) {
    const result = await runCommand("pip", ["show", runtime.packageName]);
    installed = result.exitCode === 0;
    runtimeManager.setInstalledFlag(target as RuntimeId, installed);
    output = result.stdout || result.stderr;
  } else {
    runtimeManager.setInstalledFlag(target as RuntimeId, false);
  }

  runtimeManager.ensureConfigPath(target as RuntimeId, runtime.configPath);
  const snapshot = runtimeManager.getSnapshot(target as RuntimeId);
  const effectiveConfigPath =
    snapshot.configPath && snapshot.configPath.length > 0
      ? snapshot.configPath
      : runtime.configPath;
  const configExists = await fileExists(effectiveConfigPath);

  return NextResponse.json({
    installed,
    output,
    configPath: effectiveConfigPath,
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
    return NextResponse.json({ error: `Unsupported target: ${target}` }, { status: 404 });
  }

  const body = await request.json();
  const action = body?.action as string | undefined;

  if (!action) {
    return NextResponse.json({ error: "Azione mancante" }, { status: 400 });
  }

  if (action === "init") {
    if (target === "mockpt") {
      const posixCommand = `python3 -m venv '${mockPtVenvDir}' && source '${path.join(
        mockPtVenvDir,
        "bin",
        "activate"
      )}' && pip install -r '${mockPtRequirementsPath}'`;
      const windowsCommand = `python -m venv "${mockPtVenvDir}" && "${path.join(
        mockPtVenvDir,
        "Scripts",
        "pip.exe"
      )}" install -r "${mockPtRequirementsPath}"`;
      const installResult =
        process.platform === "win32"
          ? await runCommand("cmd", ["/c", windowsCommand])
          : await runCommand("bash", ["-lc", posixCommand]);
      const success = installResult.exitCode === 0;
      runtimeManager.setInstalledFlag(target as RuntimeId, success);

      return NextResponse.json({
        success,
        installed: success,
        stdout: installResult.stdout,
        stderr: installResult.stderr,
        exitCode: installResult.exitCode,
      });
    }

    if (!runtime.wheelPath) {
      return NextResponse.json(
        { error: "Installation is not configured for this runtime." },
        { status: 400 }
      );
    }

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
    let requestedConfigPath: string | null = null;
    if (typeof body.configPath === "string" && body.configPath.length > 0) {
      requestedConfigPath = path.isAbsolute(body.configPath)
        ? body.configPath
        : path.join(projectRoot, body.configPath);
    }

    const configPathToUse = requestedConfigPath ?? runtime.configPath;

    if (target === "mockpt") {
      const normalized = path.normalize(configPathToUse);
      if (!normalized.startsWith(mockPtConfDir)) {
        return NextResponse.json(
          { error: "Invalid configuration path. Use a file under MockPT/conf." },
          { status: 400 }
        );
      }

      const venvReady = await fileExists(getMockPtPythonPath());
      if (!venvReady) {
        return NextResponse.json(
          { error: "MockPT is not initialized. Run Initialize to create the virtual environment." },
          { status: 400 }
        );
      }
    }

    const configExists = await fileExists(configPathToUse);
    if (!configExists) {
      return NextResponse.json(
        { error: "Configuration file not found. Save it from the configuration page first." },
        { status: 400 }
      );
    }

    const result = runtimeManager.startRuntime(
      target as RuntimeId,
      runtime,
      projectRoot,
      configPathToUse
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Processo già in esecuzione." }, { status: 409 });
    }

    return NextResponse.json({ success: true, configPath: configPathToUse });
  }

  if (action === "stop") {
    const result = runtimeManager.stopRuntime(target as RuntimeId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Nessun processo in esecuzione." }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
}
