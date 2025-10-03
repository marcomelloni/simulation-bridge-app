"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Label } from "@/app/components/ui/label";
import { Select } from "@/app/components/ui/select";
import { Textarea } from "@/app/components/ui/textarea";

type ProtocolKey = "rabbitmq" | "mqtt" | "rest";

type ProtocolDefinition = {
  label: string;
  target: string;
  defaultConfig: string;
  description: string;
  fileName: string;
};

const protocolDefinitions: Record<ProtocolKey, ProtocolDefinition> = {
  rabbitmq: {
    label: "RabbitMQ",
    target: "client-rabbitmq",
    description:
      "Configure the AMQP connection, exchanges and queues used by the Digital Twin client.",
    fileName: "rabbitmq_use.yaml",
    defaultConfig: `rabbitmq:
  host: localhost
  port: 5672
  vhost: /
  username: guest
  password: guest
  tls: false

exchanges:
  input_bridge:
    name: "ex.input.bridge"
    type: "topic"
    durable: true

  bridge_result:
    name: "ex.bridge.result"
    type: "topic"
    durable: true

queue:
  result_queue_prefix: "Q"
  durable: true
  routing_key: "*.result"

digital_twin:
  dt_id: "dt"
  routing_key_send: "dt"

payload_file: "../simulation.yaml"
`,
  },
  mqtt: {
    label: "MQTT",
    target: "client-mqtt",
    description:
      "Define the broker connection details together with the topics used for input and output streams.",
    fileName: "mqtt_use.yaml",
    defaultConfig: `mqtt:
  host: "localhost"
  port: 1883
  keepalive: 60
  qos: 0
  input_topic: "bridge/input"
  output_topic: "bridge/output"
  username: "guest"
  password: "guest"
  tls: false

payload_file: "../simulation.yaml"
`,
  },
  rest: {
    label: "REST",
    target: "client-rest",
    description:
      "Set the HTTPS endpoint, JWT credentials and TLS verification strategy for REST executions.",
    fileName: "rest_use.yaml",
    defaultConfig: `# REST client configuration
#
# 1. URL
#    • Use "https://" for a TLS connection.
#    • Use "http://" if you want to completely disable TLS
#      (the server must obviously also expose HTTP).
#
# 2. ssl_verify
#    This field controls **certificate verification** on the client side.
#
#      false  ──► TLS without any verification (DO NOT use in production)
#      true   ──► Verification with the operating system's trust store
#                (works only with certificates signed by public CAs
#                 or internal CAs already installed in the system).
#      <path> ──► Verification enabled and, additionally, considers trusted
#                the specified PEM certificate/CA (useful for self-signed).


# URL endpoint to send the request to
url: "https://127.0.0.1:5000/message"   # change to http://... to disable TLS

# Path to the YAML file you want to send as payload
yaml_file: "../simulation.yaml"

# JWT configuration
secret: "your-very-secure-and-long-secret-key-that-is-at-least-32-characters"
issuer: "simulation-bridge"   # Issuer of the JWT token
subject: "client-123"         # Subject of the JWT token

# Optional values
ttl: 900        # Token time-to-live in seconds (default 15 min)
timeout: 600    # Request timeout in seconds

# TLS verification strategy (see explanation above)
ssl_verify: false
`,
  },
};

const defaultSimulationYaml = `simulation:
  request_id: abcdef12345
  client_id: dt
  simulator: matlab
  type: streaming
  file: SimulationStreaming.m
  timestamp: "2024-01-01T00:00:00Z" # Timestamp for the simulation request in ISO 8601 format
  timeout: 60 # Timeout for the simulation in seconds
  inputs:
    time_step: 0.05 # Time step for the simulation
    num_agents: 8 # Number of agents
    max_steps: 200 # Max steps for the simulation
    avoidance_threshold: 1 # Minimum distance to avoid collision
    show_agent_index: 1 # Index of the agent to show
    use_gui: true # GUI flag
  outputs:
    time: float # execution time
    current_step: int # current step of the simulation
    positions: "[[float, float]]" # positions of the agents
    velocities: "[[float, float]]" # velocities of the agents
    running: bool # running flag
`;

export default function ClientConfigPage() {
  const [selectedProtocol, setSelectedProtocol] = useState<ProtocolKey>("rabbitmq");
  const [configYaml, setConfigYaml] = useState(protocolDefinitions.rabbitmq.defaultConfig);
  const [configPath, setConfigPath] = useState("");
  const [configSaving, setConfigSaving] = useState(false);
  const [configMessage, setConfigMessage] = useState("");
  const [configError, setConfigError] = useState("");
  const [configCopied, setConfigCopied] = useState(false);

  const [simulationYaml, setSimulationYaml] = useState(defaultSimulationYaml);
  const [simulationPath, setSimulationPath] = useState("");
  const [simulationSaving, setSimulationSaving] = useState(false);
  const [simulationMessage, setSimulationMessage] = useState("");
  const [simulationError, setSimulationError] = useState("");
  const [simulationCopied, setSimulationCopied] = useState(false);

  const protocolInfo = useMemo(() => protocolDefinitions[selectedProtocol], [selectedProtocol]);

  useEffect(() => {
    let ignore = false;

    const loadConfig = async () => {
      try {
        const response = await fetch(`/api/config/${protocolInfo.target}`);
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        if (ignore) return;

        if (data.exists && typeof data.content === "string") {
          setConfigYaml(data.content);
        } else {
          setConfigYaml(protocolInfo.defaultConfig);
        }
        setConfigPath(typeof data.path === "string" ? data.path : "");
      } catch (error) {
        console.error("Unable to load client configuration", error);
        if (!ignore) {
          setConfigYaml(protocolInfo.defaultConfig);
          setConfigPath("");
        }
      }
    };

    loadConfig();

    return () => {
      ignore = true;
    };
  }, [protocolInfo]);

  useEffect(() => {
    let ignore = false;

    const loadSimulationYaml = async () => {
      try {
        const response = await fetch("/api/config/client-simulation");
        if (!response.ok) return;
        const data = await response.json();
        if (ignore) return;
        if (data.exists && typeof data.content === "string") {
          setSimulationYaml(data.content);
        }
        setSimulationPath(typeof data.path === "string" ? data.path : "");
      } catch (error) {
        console.error("Unable to load simulation payload", error);
      }
    };

    loadSimulationYaml();

    return () => {
      ignore = true;
    };
  }, []);

  const handleProtocolChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as ProtocolKey;
    setSelectedProtocol(value);
    setConfigMessage("");
    setConfigError("");
    setConfigCopied(false);
    setConfigPath("");
  };

  const handleConfigSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setConfigSaving(true);
    setConfigMessage("");
    setConfigError("");

    try {
      const response = await fetch(`/api/config/${protocolInfo.target}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml: configYaml }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setConfigError(data.error ?? "Error saving configuration.");
        return;
      }

      const savedPath = typeof data.path === "string" ? data.path : "";
      setConfigPath(savedPath);
      setConfigMessage(
        savedPath ? `Configuration saved to ${savedPath}` : "Configuration saved."
      );
      setTimeout(() => setConfigMessage(""), 5000);
    } catch (error) {
      console.error("Error saving client configuration", error);
      setConfigError("Network error while saving configuration.");
    } finally {
      setConfigSaving(false);
    }
  };

  const handleConfigCopy = async () => {
    try {
      await navigator.clipboard.writeText(configYaml);
      setConfigCopied(true);
      setTimeout(() => setConfigCopied(false), 2000);
    } catch (error) {
      console.error("Unable to copy YAML", error);
    }
  };

  const handleConfigReset = () => {
    setConfigYaml(protocolInfo.defaultConfig);
    setConfigMessage("Values restored to default.");
    setTimeout(() => setConfigMessage(""), 3000);
  };

  const handleSimulationSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSimulationSaving(true);
    setSimulationMessage("");
    setSimulationError("");

    try {
      const response = await fetch("/api/config/client-simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml: simulationYaml }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSimulationError(data.error ?? "Error saving simulation payload.");
        return;
      }

      const savedPath = typeof data.path === "string" ? data.path : "";
      setSimulationPath(savedPath);
      setSimulationMessage(
        savedPath
          ? `Simulation payload saved to ${savedPath}`
          : "Simulation payload saved."
      );
      setTimeout(() => setSimulationMessage(""), 5000);
    } catch (error) {
      console.error("Error saving simulation payload", error);
      setSimulationError("Network error while saving simulation payload.");
    } finally {
      setSimulationSaving(false);
    }
  };

  const handleSimulationCopy = async () => {
    try {
      await navigator.clipboard.writeText(simulationYaml);
      setSimulationCopied(true);
      setTimeout(() => setSimulationCopied(false), 2000);
    } catch (error) {
      console.error("Unable to copy simulation payload", error);
    }
  };

  const handleSimulationReset = () => {
    setSimulationYaml(defaultSimulationYaml);
    setSimulationMessage("Values restored to default.");
    setTimeout(() => setSimulationMessage(""), 3000);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Client configuration</h1>
        <p className="text-sm text-zinc-500">
          Choose a protocol, adjust its configuration file and manage the shared
          <code className="mx-1">simulation.yaml</code> payload.
        </p>
      </div>

      <form onSubmit={handleConfigSubmit} className="grid gap-6">
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-1">
              <CardTitle>Protocol configuration</CardTitle>
              <CardDescription>{protocolInfo.description}</CardDescription>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="client-protocol">Protocol</Label>
              <Select
                id="client-protocol"
                value={selectedProtocol}
                onChange={handleProtocolChange}
              >
                {Object.entries(protocolDefinitions).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-zinc-500">
                Editing {protocolInfo.label} will save changes to
                {" "}
                {configPath ? (
                  <code>{configPath}</code>
                ) : (
                  <code>{protocolInfo.fileName}</code>
                )}
              </p>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            {configMessage ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {configMessage}
              </div>
            ) : null}
            {configError ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                {configError}
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="client-config">Configuration file</Label>
              <Textarea
                id="client-config"
                value={configYaml}
                onChange={(event) => setConfigYaml(event.target.value)}
                className="min-h-[400px] font-mono text-xs"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={configSaving}>
                {configSaving ? "Saving..." : "Save configuration"}
              </Button>
              <Button type="button" variant="outline" onClick={handleConfigReset}>
                Reset to default
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleConfigCopy}
              >
                {configCopied ? "Copied" : "Copy YAML"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <form onSubmit={handleSimulationSubmit} className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Simulation payload</CardTitle>
            <CardDescription>
              This file is shared across every client and will be sent as the
              request payload.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {simulationMessage ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {simulationMessage}
              </div>
            ) : null}
            {simulationError ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                {simulationError}
              </div>
            ) : null}

            <div className="flex flex-col gap-1 text-sm text-zinc-500">
              <span>
                <strong>Path:</strong>{" "}
                {simulationPath ? <code>{simulationPath}</code> : "File not saved yet"}
              </span>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="client-simulation">simulation.yaml</Label>
              <Textarea
                id="client-simulation"
                value={simulationYaml}
                onChange={(event) => setSimulationYaml(event.target.value)}
                className="min-h-[400px] font-mono text-xs"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={simulationSaving}>
                {simulationSaving ? "Saving..." : "Save simulation"}
              </Button>
              <Button type="button" variant="outline" onClick={handleSimulationReset}>
                Reset to default
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleSimulationCopy}
              >
                {simulationCopied ? "Copied" : "Copy YAML"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
