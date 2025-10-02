"use client";

import { useEffect, useState } from "react";

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

const defaultSimulationYaml = `simulation_bridge:
  bridge_id: simulation_bridge
  in_memory_mode: false

rabbitmq:
  host: localhost
  port: 5672
  vhost: /
  username: guest
  password: guest
  tls: false
  infrastructure: |
    infrastructure:
      exchanges:
        - name: ex.input.bridge
          type: topic
          durable: true
          auto_delete: false
          internal: false

        - name: ex.bridge.output
          type: topic
          durable: true
          auto_delete: false
          internal: false

        - name: ex.sim.result
          type: topic
          durable: true
          auto_delete: false
          internal: false

        - name: ex.bridge.result
          type: topic
          durable: true
          auto_delete: false
          internal: false

      queues:
        - name: Q.bridge.input
          durable: true
          exclusive: false
          auto_delete: false

        - name: Q.bridge.result
          durable: true
          exclusive: false
          auto_delete: false

      bindings:
        - queue: Q.bridge.input
          exchange: ex.input.bridge
          routing_key: "#"

        - queue: Q.bridge.result
          exchange: ex.sim.result
          routing_key: "#"

mqtt:
  host: localhost
  port: 1883
  keepalive: 60
  input_topic: bridge/input
  output_topic: bridge/output
  qos: 0
  username: guest
  password: guest
  tls: false

rest:
  host: localhost
  port: 5000
  endpoint: /message
  debug: false
  certfile: certs/cert.pem
  keyfile: certs/key.pem
  jwt:
    secret: CHANGE_ME_TO_A_LONG_RANDOM_VALUE
    algorithm: HS256
    max_token_age_seconds: 3600

logging:
  level: DEBUG
  format: '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
  file: logs/sim_bridge.log

performance:
  enabled: false
  file: performance_log/performance_metrics.csv`;

export default function SimulationBridgeConfigPage() {
  const [configYaml, setConfigYaml] = useState(defaultSimulationYaml);
  const [path, setPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch("/api/config/simulation-bridge");
        if (!response.ok) return;
        const data = await response.json();
        if (data.exists && typeof data.content === "string") {
          setConfigYaml(data.content);
          setPath(typeof data.path === "string" ? data.path : "");
        }
      } catch (err) {
        console.error(
          "Impossibile caricare la configurazione Simulation Bridge",
          err
        );
      }
    };

    loadConfig();
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/config/simulation-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml: configYaml }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          data.error ?? "Errore durante il salvataggio della configurazione."
        );
        return;
      }

      const savedPath = typeof data.path === "string" ? data.path : "";
      setPath(savedPath);
      setMessage(
        savedPath
          ? `Configurazione salvata in ${savedPath}`
          : "Configurazione salvata."
      );
      setTimeout(() => setMessage(""), 5000);
    } catch (err) {
      console.error("Errore salvataggio Simulation Bridge", err);
      setError("Errore di rete durante il salvataggio della configurazione.");
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(configYaml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Errore copia YAML", err);
    }
  };

  const handleReset = () => {
    setConfigYaml(defaultSimulationYaml);
    setMessage("Valori ripristinati.");
    setTimeout(() => setMessage(""), 3000);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Simulation Bridge</h1>
        <p className="text-sm text-zinc-500">
          Modifica la configurazione del bridge principale e salva il file
          <code>config.yaml</code> pronto per l'esecuzione.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Configurazione YAML</CardTitle>
            <CardDescription>
              Personalizza il comportamento del Simulation Bridge.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Label htmlFor="simulation-bridge-config">
              simulation-bridge/config.yaml
            </Label>
            <Textarea
              id="simulation-bridge-config"
              value={configYaml}
              onChange={(event) => setConfigYaml(event.target.value)}
              className="min-h-[500px] font-mono text-xs"
            />
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Salvataggio..." : "Salva configurazione"}
              </Button>
              <Button type="button" variant="secondary" onClick={handleCopy}>
                {copied ? "Copiato!" : "Copia YAML"}
              </Button>
              <Button type="button" variant="outline" onClick={handleReset}>
                Ripristina template
              </Button>
            </div>
            {message ? (
              <p className="text-sm text-zinc-500">{message}</p>
            ) : null}
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
            {path ? (
              <p className="text-xs text-zinc-500">
                Percorso attuale: <code>{path}</code>
              </p>
            ) : (
              <p className="text-xs text-amber-600">
                Salva per generare il file di configurazione.
              </p>
            )}
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
