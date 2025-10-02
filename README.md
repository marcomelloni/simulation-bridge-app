# Simulation Bridge App

A web interface for configuring and controlling [Simulation Bridge](https://github.com/INTO-CPS-Association/simulation-bridge) and its associated agents.

## Prerequisites

- **Node.js 18+** (or 20+) and npm
- **Python 3.12** (or 3.11) installed system-wide
- `pip` available in the PATH (do not use virtual environments)

### Installing Python Packages

Before launching the console, install the provided packages from the `dist/` directory (run once):

```bash
pip install dist/simulation_bridge-0.1.1-py3-none-any.whl
pip install dist/anylogic_agent-0.1.0-py3-none-any.whl
pip install dist/matlab_agent-1.0.0-py3-none-any.whl
```

Execute these commands in the global Python environment you will use to run the processes.

### Installing Node Dependencies

```bash
npm install
```

## Starting the Application

```bash
npm run dev
```

The console will be accessible at <http://localhost:3000>.
