const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: node run_workflow_args.js <run|submit|validate> <workflow_id> <args_json_file> [extra_comfyui_skill_args...]');
  console.error('Example: node run_workflow_args.js run local/anima-txt2img-aesthetic-lora args/job_01.json');
  console.error('Example: node run_workflow_args.js submit local/anima-txt2img-aesthetic-lora args/job_01.json --priority -1');
  console.error('Example: node run_workflow_args.js validate local/anima-txt2img-aesthetic-lora args/job_01.json');
}

const [, , mode, workflowId, argsFile, ...extraArgs] = process.argv;

if (!mode || !workflowId || !argsFile || !['run', 'submit', 'validate'].includes(mode)) {
  usage();
  process.exit(2);
}

const workspace = __dirname;
const resolvedArgsFile = path.resolve(workspace, argsFile);

function resolveRuntimeRoot() {
  if (process.env.COMFYUI_MANAGER_RUNTIME_DIR) {
    return path.resolve(process.env.COMFYUI_MANAGER_RUNTIME_DIR);
  }
  const runtimeRoot = process.env.SKILL_RUNTIME_ROOT;
  if (runtimeRoot) {
    return path.resolve(runtimeRoot, 'comfyui-manager');
  }
  const configRuntime = resolveRuntimeFromConfig();
  if (configRuntime) {
    return configRuntime;
  }
  const existingRuntime = findExistingRuntimeRoot(workspace, 'comfyui-manager');
  if (existingRuntime) {
    return existingRuntime;
  }
  return path.resolve(workspace, '..', '..', 'runtime', 'comfyui-manager');
}

function resolveRuntimeFromConfig() {
  const configPath = path.join(workspace, 'config.json');
  if (!fs.existsSync(configPath)) return '';
  try {
    const config = readJsonFile(configPath);
    const server = Array.isArray(config.servers) ? config.servers.find((item) => item && item.output_dir) : null;
    if (!server) return '';
    const outputDir = path.resolve(workspace, server.output_dir);
    if (path.basename(outputDir).toLowerCase() !== 'outputs') return '';
    if (path.dirname(outputDir) === path.resolve(workspace)) {
      return path.resolve(workspace, '..', '..', 'runtime', 'comfyui-manager');
    }
    return path.dirname(outputDir);
  } catch {
    return '';
  }
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function readJsonFile(filePath) {
  return JSON.parse(stripBom(fs.readFileSync(filePath, 'utf8')));
}

function findExistingRuntimeRoot(start, runtimeName) {
  let cursor = path.resolve(start);
  while (cursor) {
    const root = path.join(cursor, 'runtime');
    if (fs.existsSync(root)) return path.join(root, runtimeName);
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return '';
}

function workflowHistoryDirs(workflowIdValue) {
  const parts = String(workflowIdValue).split(/[\\/]/).filter(Boolean);
  if (parts.length < 2) return [];
  const provider = parts[0];
  const workflowName = parts[parts.length - 1];
  return [{
    source: path.join(workspace, 'data', provider, workflowName, 'history'),
    target: path.join(resolveRuntimeRoot(), 'history', workflowName),
  }];
}

function moveFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  try {
    fs.renameSync(source, target);
  } catch {
    fs.copyFileSync(source, target);
    fs.rmSync(source, { force: true });
  }
}

function moveGeneratedHistory(workflowIdValue) {
  for (const { source, target } of workflowHistoryDirs(workflowIdValue)) {
    if (!fs.existsSync(source)) continue;
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      moveFile(path.join(source, entry.name), path.join(target, entry.name));
    }
    if (fs.readdirSync(source).length === 0) {
      fs.rmdirSync(source);
    }
  }
}

let argsJson;
try {
  argsJson = JSON.stringify(readJsonFile(resolvedArgsFile));
} catch (error) {
  console.error(`[run_workflow_args] Failed to read/parse args JSON: ${resolvedArgsFile}`);
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
}

const comfyMode = mode === 'validate' ? 'run' : mode;
const comfyArgs = ['--json', comfyMode, workflowId];
if (mode === 'validate') comfyArgs.push('--validate');
comfyArgs.push(`--args=${argsJson}`, ...extraArgs);

const child = spawn(
  'comfyui-skill',
  comfyArgs,
  {
    cwd: workspace,
    stdio: 'inherit',
    shell: false,
  },
);

child.on('close', (code) => {
  if (mode !== 'validate') {
    try {
      moveGeneratedHistory(workflowId);
    } catch (error) {
      console.error(`[run_workflow_args] Failed to move generated history to runtime: ${error && error.message ? error.message : String(error)}`);
    }
  }
  process.exit(code ?? 1);
});
