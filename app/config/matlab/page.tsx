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

const defaultMatlabYaml = `agent:
  agent_id: matlab
  simulator: matlab

rabbitmq:
  host: localhost
  port: 5672
  username: guest
  password: guest
  heartbeat: 600
  vhost: /
  tls: false

simulation:
  path: /Users/foo/simulation-bridge/agents/matlab/matlab_agent/docs/examples

exchanges:
  input: ex.bridge.output
  output: ex.sim.result

queue:
  durable: true
  prefetch_count: 1

logging:
  level: INFO
  file: logs/matlab_agent.log

performance:
  enabled: false
  log_dir: performance_logs
  log_filename: performance_metrics.csv

tcp:
  host: localhost
  input_port: 5679
  output_port: 5678

response_templates:
  success:
    status: success
    simulation:
      type: batch
    timestamp_format: "%Y-%m-%dT%H:%M:%SZ"
    include_metadata: true
    metadata_fields:
      - execution_time
      - memory_usage
      - matlab_version

  error:
    status: error
    include_stacktrace: false
    error_codes:
      invalid_config: 400
      matlab_start_failure: 500
      execution_error: 500
      timeout: 504
      missing_file: 404
    timestamp_format: "%Y-%m-%dT%H:%M:%SZ"

  progress:
    status: in_progress
    include_percentage: true
    update_interval: 5
    timestamp_format: "%Y-%m-%dT%H:%M:%SZ"`;

export default function MatlabConfigPage() {
  const [config, setConfig] = useState(defaultMatlabYaml);
  const [path, setPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch("/api/config/matlab-agent");
        if (!response.ok) return;
        const data = await response.json();
        if (data.exists && typeof data.content === "string") {
          setConfig(data.content);
          setPath(typeof data.path === "string" ? data.path : "");
        }
      } catch (err) {
        console.error("Unable to load Matlab configuration", err);
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
      const response = await fetch("/api/config/matlab-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml: config }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Error saving configuration.");
        return;
      }

      const savedPath = typeof data.path === "string" ? data.path : "";
      setPath(savedPath);
      setMessage(
        savedPath
          ? `Configuration saved to ${savedPath}`
          : "Configuration saved."
      );
      setTimeout(() => setMessage(""), 5000);
    } catch (err) {
      console.error("Matlab save error", err);
      setError("Network error while saving configuration.");
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(config);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Matlab copy error", err);
    }
  };

  const handleReset = () => {
    setConfig(defaultMatlabYaml);
    setMessage("Values restored.");
    setTimeout(() => setMessage(""), 3000);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Matlab Agent</h1>
        <p className="text-sm text-zinc-500">
          Edit the Matlab agent configuration and save the
          <code>config.yaml</code> file ready for execution.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>YAML Configuration</CardTitle>
            <CardDescription>
              Customize the Matlab agent behavior.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Label htmlFor="matlab-config">matlab/config.yaml</Label>
            <Textarea
              id="matlab-config"
              value={config}
              onChange={(event) => setConfig(event.target.value)}
              className="min-h-[500px] font-mono text-xs"
            />
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save configuration"}
              </Button>
              <Button type="button" variant="secondary" onClick={handleCopy}>
                {copied ? "Copied!" : "Copy YAML"}
              </Button>
              <Button type="button" variant="outline" onClick={handleReset}>
                Reset template
              </Button>
            </div>
            {message ? (
              <p className="text-sm text-zinc-500">{message}</p>
            ) : null}
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
            {path ? (
              <p className="text-xs text-zinc-500">
                Current path: <code>{path}</code>
              </p>
            ) : (
              <p className="text-xs text-amber-600">
                Save to generate the configuration file.
              </p>
            )}
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
