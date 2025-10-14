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
import { Textarea } from "@/app/components/ui/textarea";

type Protocol = "http" | "mqtt";

const defaultHttpConfig = `protocols:
  - id: "httpProtocol"
    type: "http"
    config:
      server_port: 5555 # The server port to be used for HTTP communication
devices:
  - id: "device1" # Unique identifier for the device
    protocol_id: "httpProtocol" # Which publishing protocol the device uses (e.g., HTTP)
    sensors:
      # SENSOR POWERED BY THE SIMULATION BRIDGE
      - id: "distanceSensor" # Unique identifier for the sensor
        type: "numeric" # The data type of the sensor (numeric, boolean, string, json, etc.)
        source: "bridge" # Indicates that the sensor data comes from the Simulation Bridge
        source_id: "simBridge1" # Reference to the provider that feeds this sensor
        update_time_ms: 500 # The frequency at which the sensor publishes its value (in milliseconds)
        bridge_value: "data.distance" # The path in the JSON returned by the bridge to extract the sensor value
        # [NOTE] When source=bridge, do not specify local generator parameters (e.g., min_val, max_val, value).

      - id: "all_in_one"
        type: "json"
        source: "bridge"
        source_id: "simBridge1"
        update_time_ms: 1000
        bridge_value: "data"

      # LOCAL SENSOR
      - id: "randomStringSensor"
        type: "random_string"
        source: "local"
        update_time_ms: 2000
        value_len: 10
        # [NOTE] Parameters like min_val/max_val for numeric or value_len for strings are only allowed when source=local.

    actuators:
      - id: "demoActuator"
        type: "string"
        initial_value: "ON"

data_providers:
  # Defines the data provider used for simulation (Simulation Bridge).
  - source_id: "simBridge1" # Unique identifier for the simulation data provider
    type: "simulation_bridge" # The type of data provider (Simulation Bridge)
    protocol_config: "../sb-conf/mqtt_use.yaml" # Path to external configuration for transport protocol
    payload_config: "../sb-conf/simulation.yaml" # Path to external configuration for simulation payload

independent_communication: True
device_update_delay_ms: 10`;

const defaultMqttConfig = `protocols:
  - id: "mqttProtocol"
    type: "mqtt"
    config:
      broker_ip: "localhost"
      broker_port: 1883
      username: null
      password: null
devices:
  - id: "device1" # Unique identifier for the device
    protocol_id: "mqttProtocol" # Which publishing protocol the device uses (e.g., HTTP)
    sensors:
      # SENSOR POWERED BY THE SIMULATION BRIDGE
      - id: "distanceSensor" # Unique identifier for the sensor
        type: "numeric" # The data type of the sensor (numeric, boolean, string, json, etc.)
        source: "bridge" # Indicates that the sensor data comes from the Simulation Bridge
        source_id: "simBridge1" # Reference to the provider feeding this sensor
        update_time_ms: 500 # The frequency at which the sensor publishes its value (in milliseconds)
        bridge_value: "data.distance" # The path in the JSON returned by the bridge to extract the sensor value
        # [NOTE] When source=bridge, do not specify local generator parameters (e.g., min_val, max_val, value).

      - id: "all_in_one"
        type: "json"
        source: "bridge"
        source_id: "simBridge1"
        update_time_ms: 1000
        bridge_value: "data"

      # LOCAL SENSOR
      - id: "randomStringSensor"
        type: "random_string"
        source: "local"
        update_time_ms: 2000
        value_len: 10
        # [NOTE] Parameters like min_val/max_val for numeric or value_len for strings are only allowed when source=local.

    actuators:
      - id: "demoActuator"
        type: "string"
        initial_value: "ON"

data_providers:
  # Defines the data provider used for simulation (Simulation Bridge).
  - source_id: "simBridge1" # Unique identifier for the simulation data provider
    type: "simulation_bridge" # The type of data provider (Simulation Bridge)
    protocol_config: "../sb-conf/mqtt_use.yaml" # Path to external configuration for transport protocol
    payload_config: "../sb-conf/simulation.yaml" # Path to external configuration for simulation payload

independent_communication: True
device_update_delay_ms: 10`;

const apiTargetByProtocol: Record<Protocol, string> = {
  http: "mockpt-http",
  mqtt: "mockpt-mqtt",
};

const defaultByProtocol: Record<Protocol, string> = {
  http: defaultHttpConfig,
  mqtt: defaultMqttConfig,
};

export default function MockPtConfigPage() {
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol>("http");
  const [configs, setConfigs] = useState<Record<Protocol, string>>({
    http: defaultHttpConfig,
    mqtt: defaultMqttConfig,
  });
  const [paths, setPaths] = useState<Record<Protocol, string>>({
    http: "",
    mqtt: "",
  });
  const [loading, setLoading] = useState<Record<Protocol, boolean>>({
    http: true,
    mqtt: true,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const loadConfig = async (protocol: Protocol) => {
      try {
        const response = await fetch(`/api/config/${apiTargetByProtocol[protocol]}`);
        if (!response.ok) return;
        const data = await response.json();
        if (typeof data.path === "string") {
          setPaths((prev) => ({ ...prev, [protocol]: data.path }));
        }
        if (data.exists && typeof data.content === "string") {
          setConfigs((prev) => ({ ...prev, [protocol]: data.content }));
        }
      } catch (err) {
        console.error(`Unable to load MockPT ${protocol.toUpperCase()} configuration`, err);
      } finally {
        setLoading((prev) => ({ ...prev, [protocol]: false }));
      }
    };

    loadConfig("http");
    loadConfig("mqtt");
  }, []);

  const currentConfig = configs[selectedProtocol];
  const currentPath = paths[selectedProtocol];
  const isLoading = loading[selectedProtocol];

  const protocolLabel = useMemo(() => {
    return selectedProtocol === "http" ? "HTTP" : "MQTT";
  }, [selectedProtocol]);

  const handleProtocolChange = (protocol: Protocol) => {
    setSelectedProtocol(protocol);
    setMessage("");
    setError("");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const target = apiTargetByProtocol[selectedProtocol];
      const response = await fetch(`/api/config/${target}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml: configs[selectedProtocol] }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Failed to save configuration.");
        return;
      }

      const savedPath = typeof data.path === "string" ? data.path : "";
      setPaths((prev) => ({ ...prev, [selectedProtocol]: savedPath }));
      setMessage(
        savedPath
          ? `${protocolLabel} configuration saved to ${savedPath}`
          : `${protocolLabel} configuration saved.`
      );
      setTimeout(() => setMessage(""), 5000);
    } catch (err) {
      console.error("Error saving MockPT configuration", err);
      setError("Network error while saving configuration.");
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(configs[selectedProtocol]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Unable to copy MockPT configuration", err);
    }
  };

  const handleReset = () => {
    const defaultValue = defaultByProtocol[selectedProtocol];
    setConfigs((prev) => ({ ...prev, [selectedProtocol]: defaultValue }));
    setMessage("Template restored.");
    setTimeout(() => setMessage(""), 3000);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">MockPT</h1>
        <p className="text-sm text-zinc-500">
          Configure the Mock Physical Twin integration with the Simulation Bridge by picking
          the HTTP or MQTT template and saving the corresponding file in{" "}
          <code>MockPT/conf/</code>.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={selectedProtocol === "http" ? "default" : "outline"}
          onClick={() => handleProtocolChange("http")}
        >
          HTTP
        </Button>
        <Button
          type="button"
          variant={selectedProtocol === "mqtt" ? "default" : "outline"}
          onClick={() => handleProtocolChange("mqtt")}
        >
          MQTT
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{protocolLabel} Configuration</CardTitle>
            <CardDescription>
              Edit and save{" "}
              <code>
                {selectedProtocol === "http"
                  ? "http_simulation_config.yaml"
                  : "mqtt_simulation_config.yaml"}
              </code>
              {" "}under <code>MockPT/conf</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Label htmlFor={`mockpt-config-${selectedProtocol}`}>
              {selectedProtocol === "http"
                ? "MockPT/conf/http_simulation_config.yaml"
                : "MockPT/conf/mqtt_simulation_config.yaml"}
            </Label>
            <Textarea
              id={`mockpt-config-${selectedProtocol}`}
              value={currentConfig}
              disabled={isLoading}
              onChange={(event) =>
                setConfigs((prev) => ({
                  ...prev,
                  [selectedProtocol]: event.target.value,
                }))
              }
              className="min-h-[500px] font-mono text-xs"
            />
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={saving || isLoading}>
                {saving ? "Saving..." : "Save configuration"}
              </Button>
              <Button type="button" variant="secondary" onClick={handleCopy} disabled={isLoading}>
                {copied ? "Copied!" : "Copy YAML"}
              </Button>
              <Button type="button" variant="outline" onClick={handleReset} disabled={isLoading}>
                Reset template
              </Button>
            </div>
            {message ? <p className="text-sm text-zinc-500">{message}</p> : null}
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
            {currentPath ? (
              <p className="text-xs text-zinc-500">
                Current path: <code>{currentPath}</code>
              </p>
            ) : (
              <p className="text-xs text-amber-600">
                Save to generate the {protocolLabel} configuration file.
              </p>
            )}
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
