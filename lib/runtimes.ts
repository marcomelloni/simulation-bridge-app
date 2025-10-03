export type RuntimeId =
  | "simulation-bridge"
  | "anylogic-agent"
  | "matlab-agent"
  | "client-rabbitmq"
  | "client-mqtt"
  | "client-rest";

export const runtimeOrder: RuntimeId[] = [
  "simulation-bridge",
  "anylogic-agent",
  "matlab-agent",
  "client-rabbitmq",
  "client-mqtt",
  "client-rest",
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
      "Configure and prepare the main bridge responsible for connecting simulators.",
    installHint: "pip install dist/simulation_bridge-0.1.1-py3-none-any.whl",
    runPreview: "simulation-bridge -c <config.yaml>",
  },
  "anylogic-agent": {
    title: "AnyLogic Agent",
    description:
      "Manage AnyLogic simulations by orchestrating execution and sending results to the bridge.",
    installHint: "pip install dist/anylogic_agent-0.1.0-py3-none-any.whl",
    runPreview: "anylogic-agent --config-file <config.yaml>",
  },
  "matlab-agent": {
    title: "Matlab Agent",
    description:
      "Execute Matlab scenarios and communicate with the bridge following the settings defined in the configuration file.",
    installHint: "pip install dist/matlab_agent-1.0.0-py3-none-any.whl",
    runPreview: "matlab-agent --config-file <config.yaml>",
  },
  "client-rabbitmq": {
    title: "RabbitMQ Client",
    description:
      "Send simulation payloads through RabbitMQ and listen for bridge responses using the dedicated Digital Twin queue.",
    installHint:
      "python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt",
    runPreview: "python3 rabbitmq_client.py",
  },
  "client-mqtt": {
    title: "MQTT Client",
    description:
      "Publish simulation requests to the MQTT input topic and stream results from the configured output topic.",
    installHint:
      "python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt",
    runPreview: "python3 mqtt_client.py",
  },
  "client-rest": {
    title: "REST Client",
    description:
      "Send HTTPS requests with JWT authentication to the Simulation Bridge REST endpoint and inspect the responses.",
    installHint:
      "python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt",
    runPreview: "python3 rest_client.py",
  },
};
