const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  readJsonFile,
  resolveRuntimeRoot,
  stripBom,
} = require("./runtime_utils");

function usage() {
  console.error(
    "Usage: node run_workflow_args.js <run|submit|validate> <workflow_id> <args_json_file> [extra_comfyui_skill_args...]"
  );
  console.error(
    "Example: node run_workflow_args.js run local/anima-txt2img-aesthetic-lora args/job_01.json"
  );
  console.error(
    "Example: node run_workflow_args.js submit local/anima-txt2img-aesthetic-lora args/job_01.json --priority -1"
  );
  console.error(
    "Example: node run_workflow_args.js validate local/anima-txt2img-aesthetic-lora args/job_01.json"
  );
}

const [, , mode, workflowId, argsFile, ...extraArgs] = process.argv;

if (
  !mode ||
  !workflowId ||
  !argsFile ||
  !["run", "submit", "validate"].includes(mode)
) {
  usage();
  process.exit(2);
}

const workspace = __dirname;
const resolvedArgsFile = path.resolve(workspace, argsFile);

function workflowHistoryDirs(workflowIdValue) {
  const parts = String(workflowIdValue).split(/[\\/]/).filter(Boolean);
  if (parts.length < 2) return [];
  const provider = parts[0];
  const workflowName = parts[parts.length - 1];
  return [
    {
      source: path.join(workspace, "data", provider, workflowName, "history"),
      target: path.join(resolveRuntimeRoot(workspace), "history", workflowName),
    },
  ];
}

function runComfyuiSkill(args, options = {}) {
  try {
    const raw = execFileSync(
      "comfyui-skill",
      ["--json", "--dir", workspace, ...args],
      {
        cwd: workspace,
        encoding: "utf8",
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: options.timeout || 120000,
      }
    );
    return JSON.parse(stripBom(raw));
  } catch (error) {
    error.comfyuiSkillPayload = parseComfyuiSkillError(error);
    throw error;
  }
}

function parseComfyuiSkillError(error) {
  const chunks = [error && error.stdout, error && error.stderr]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);
  for (const chunk of chunks) {
    try {
      return JSON.parse(stripBom(chunk));
    } catch {
      // Keep scanning; comfyui-skill may print non-JSON diagnostics too.
    }
  }
  return null;
}

function shouldDirectApiFallback(error) {
  const payload = error && error.comfyuiSkillPayload;
  const message = JSON.stringify(payload || {}) + "\n" + String(error && error.message ? error.message : "");
  return /502|Bad Gateway|SUBMIT_FAILED/i.test(message);
}

function readConfig() {
  const configPath = path.join(workspace, "config.json");
  const config = fs.existsSync(configPath) ? readJsonFile(configPath) : {};
  const servers = Array.isArray(config.servers) ? config.servers : [];
  const selected =
    servers.find((item) => item && item.id === (config.default_server || "local")) ||
    servers.find((item) => item && item.enabled !== false) ||
    {};
  return {
    url: String(selected.url || "http://127.0.0.1:8188").replace(/\/+$/, ""),
  };
}

function workflowDir(workflowIdValue) {
  const parts = String(workflowIdValue).split(/[\\/]/).filter(Boolean);
  return path.join(workspace, "data", ...parts);
}

function applyArgsToWorkflow(workflow, schema, args) {
  const parameters = schema && schema.parameters ? schema.parameters : {};
  for (const [argName, value] of Object.entries(args)) {
    const parameter = parameters[argName];
    if (!parameter) continue;
    const node = workflow[String(parameter.node_id)];
    if (!node || !node.inputs) {
      throw new Error(`Workflow node not found for arg "${argName}": ${parameter.node_id}`);
    }
    node.inputs[parameter.field] = value;
  }
}

function validateArgsAgainstSchema(schema, args) {
  const parameters = schema && schema.parameters ? schema.parameters : {};
  for (const [name, parameter] of Object.entries(parameters)) {
    if (parameter.required && (args[name] === undefined || args[name] === null || args[name] === "")) {
      throw new Error(`Missing required workflow arg: ${name}`);
    }
  }
}

function loadWorkflowPayload() {
  const dir = workflowDir(workflowId);
  const workflow = readJsonFile(path.join(dir, "workflow.json"));
  const schema = readJsonFile(path.join(dir, "schema.json"));
  const args = JSON.parse(argsJson);
  validateArgsAgainstSchema(schema, args);
  applyArgsToWorkflow(workflow, schema, args);
  return { workflow, schema, args };
}

async function directApiRequest(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload = text;
  try {
    payload = text ? JSON.parse(stripBom(text)) : {};
  } catch {
    // Keep plain text for error reporting.
  }
  if (!response.ok) {
    const error = new Error(`ComfyUI API ${response.status}: ${text || response.statusText}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function directApiSubmit() {
  const { workflow } = loadWorkflowPayload();
  const { url } = readConfig();
  const payload = await directApiRequest("POST", `${url}/prompt`, {
    prompt: workflow,
    client_id: `codex-${Date.now()}`,
  });
  return { ...payload, fallback: "direct_comfyui_api" };
}

async function directApiValidate() {
  const { url } = readConfig();
  const { args } = loadWorkflowPayload();
  await directApiRequest("GET", `${url}/system_stats`);
  return {
    status: "local_validated",
    workflow_id: workflowId,
    args_keys: Object.keys(args),
    fallback: "direct_comfyui_api",
    note: "Schema and server reachability validated locally; no image was queued.",
  };
}

async function directApiRun() {
  const submitPayload = await directApiSubmit();
  const promptId = submitPayload.prompt_id || submitPayload.id;
  if (!promptId) return submitPayload;
  const { url } = readConfig();
  const startedAt = Date.now();
  const timeoutMs = Number.parseInt(
    process.env.COMFYUI_SKILL_RUN_TIMEOUT_MS || "1800000",
    10
  );
  const pollMs = Number.parseInt(
    process.env.COMFYUI_SKILL_POLL_MS || "2000",
    10
  );
  while (Date.now() - startedAt <= timeoutMs) {
    const history = await directApiRequest("GET", `${url}/history/${promptId}`);
    if (history && history[promptId]) {
      writeRuntimeHistory(
        {
          ...history[promptId],
          status: history[promptId].status && history[promptId].status.status_str,
          prompt_id: promptId,
          fallback: "direct_comfyui_api",
        },
        workflowId,
        argsJson
      );
      return history[promptId];
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`[direct_api_run] Timed out waiting for prompt_id: ${promptId}`);
}

function normalizeStatus(value) {
  return String(value || "").toLowerCase();
}

function isTerminalStatus(statusPayload) {
  const status = normalizeStatus(statusPayload.status);
  return [
    "success",
    "completed",
    "error",
    "failed",
    "cancelled",
    "canceled",
  ].includes(status);
}

function writeRuntimeHistory(statusPayload, workflowId, argsJson) {
  const promptId = statusPayload.prompt_id || statusPayload.id;
  if (!promptId) return;
  const targetDir = workflowHistoryDirs(workflowId)[0].target;
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(
    path.join(targetDir, `${promptId}.json`),
    JSON.stringify(
      {
        ...statusPayload,
        workflow_id: workflowId,
        run_id: promptId,
        args: JSON.parse(argsJson),
        created_at: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );
}

function runBySubmitAndPoll() {
  const submitPayload = runComfyuiSkill([
    "submit",
    workflowId,
    `--args=${argsJson}`,
    ...extraArgs,
  ]);
  const promptId = submitPayload.prompt_id || submitPayload.id;
  if (!promptId) {
    console.log(JSON.stringify(submitPayload, null, 2));
    process.exit(1);
  }

  const startedAt = Date.now();
  const timeoutMs = Number.parseInt(
    process.env.COMFYUI_SKILL_RUN_TIMEOUT_MS || "1800000",
    10
  );
  const pollMs = Number.parseInt(
    process.env.COMFYUI_SKILL_POLL_MS || "2000",
    10
  );
  let statusPayload = submitPayload;

  while (Date.now() - startedAt <= timeoutMs) {
    statusPayload = runComfyuiSkill(["status", promptId]);
    if (isTerminalStatus(statusPayload)) {
      writeRuntimeHistory(statusPayload, workflowId, argsJson);
      console.log(JSON.stringify(statusPayload, null, 2));
      const status = normalizeStatus(statusPayload.status);
      process.exit(["success", "completed"].includes(status) ? 0 : 1);
    }
    // Synchronous sleep keeps this small CLI dependency-free while polling run status.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pollMs);
  }

  console.error(
    `[run_workflow_args] Timed out waiting for prompt_id: ${promptId}`
  );
  console.log(JSON.stringify(statusPayload, null, 2));
  process.exit(1);
}

let argsJson;
try {
  argsJson = JSON.stringify(readJsonFile(resolvedArgsFile));
} catch (error) {
  console.error(
    `[run_workflow_args] Failed to read/parse args JSON: ${resolvedArgsFile}`
  );
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
}

async function main() {
  try {
    if (mode === "submit") {
      const submitPayload = runComfyuiSkill([
        "submit",
        workflowId,
        `--args=${argsJson}`,
        ...extraArgs,
      ]);
      console.log(JSON.stringify(submitPayload, null, 2));
    } else if (mode === "validate") {
      const validatePayload = runComfyuiSkill([
        "run",
        workflowId,
        "--validate",
        `--args=${argsJson}`,
        ...extraArgs,
      ]);
      console.log(JSON.stringify(validatePayload, null, 2));
    } else {
      runBySubmitAndPoll();
    }
  } catch (error) {
    if (!shouldDirectApiFallback(error)) throw error;
    let fallbackPayload;
    if (mode === "submit") {
      fallbackPayload = await directApiSubmit();
    } else if (mode === "validate") {
      fallbackPayload = await directApiValidate();
    } else {
      fallbackPayload = await directApiRun();
    }
    console.log(JSON.stringify(fallbackPayload, null, 2));
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
