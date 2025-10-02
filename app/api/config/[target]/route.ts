import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const appRoot = process.cwd();

const CONFIG_TARGETS = {
  "simulation-bridge": {
    configDir: path.join(appRoot, "simulation-bridge"),
    fileName: "config.yaml",
  },
  "anylogic-agent": {
    configDir: path.join(appRoot, "simulation-bridge", "anylogic-agent"),
    fileName: "config.yaml",
  },
  "matlab-agent": {
    configDir: path.join(appRoot, "simulation-bridge", "matlab-agent"),
    fileName: "config.yaml",
  },
} as const;

type TargetKey = keyof typeof CONFIG_TARGETS;

type RouteContext = {
  params: Promise<{
    target: string;
  }>;
};

const getTargetInfo = (target: string) => {
  return CONFIG_TARGETS[target as TargetKey] ?? null;
};

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { target } = await params;
  const info = getTargetInfo(target);
  if (!info) {
    return NextResponse.json(
      { error: `Target non supportato: ${target}` },
      { status: 404 }
    );
  }

  const configPath = path.join(info.configDir, info.fileName);

  try {
    const content = await fs.readFile(configPath, "utf-8");
    return NextResponse.json({ exists: true, path: configPath, content });
  } catch (error) {
    return NextResponse.json({ exists: false, path: configPath });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { target } = await params;
  const info = getTargetInfo(target);
  if (!info) {
    return NextResponse.json(
      { error: `Target non supportato: ${target}` },
      { status: 404 }
    );
  }

  try {
    const body = await request.json();
    const yaml = typeof body.yaml === "string" ? body.yaml : null;

    if (!yaml) {
      return NextResponse.json(
        { error: "Payload mancante o non valido" },
        { status: 400 }
      );
    }

    await fs.mkdir(info.configDir, { recursive: true });
    const configPath = path.join(info.configDir, info.fileName);
    await fs.writeFile(configPath, yaml, "utf-8");

    return NextResponse.json({ ok: true, path: configPath });
  } catch (error) {
    console.error("Errore salvataggio config", error);
    return NextResponse.json(
      { error: "Impossibile salvare la configurazione" },
      { status: 500 }
    );
  }
}
