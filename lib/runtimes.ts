export type RuntimeId = "simulation-bridge" | "anylogic-agent" | "matlab-agent";

export const runtimeOrder: RuntimeId[] = [
  "simulation-bridge",
  "anylogic-agent",
  "matlab-agent",
];

export interface RuntimeUiDefinition {
  title: string;
  description: string;
  installHint: string;
  runPreview: string;
}

export const runtimeUiDefinitions: Record<RuntimeId, RuntimeUiDefinition> = {
  "simulation-bridge": {
    title: "Simulation Bridge",
    description:
      "Configura e prepara il bridge principale responsabile del collegamento tra i simulatori.",
    installHint: "pip install dist/simulation_bridge-0.1.1-py3-none-any.whl",
    runPreview: "simulation-bridge -c <config.yaml>",
  },
  "anylogic-agent": {
    title: "AnyLogic Agent",
    description:
      "Gestisce le simulazioni AnyLogic orchestrando l'esecuzione e inviando i risultati al bridge.",
    installHint: "pip install dist/anylogic_agent-0.1.0-py3-none-any.whl",
    runPreview: "anylogic-agent --config-file <config.yaml>",
  },
  "matlab-agent": {
    title: "Matlab Agent",
    description:
      "Esegue scenari Matlab e comunica con il bridge seguendo le impostazioni definite nel file di configurazione.",
    installHint: "pip install dist/matlab_agent-1.0.0-py3-none-any.whl",
    runPreview: "matlab-agent --config-file <config.yaml>",
  },
};
