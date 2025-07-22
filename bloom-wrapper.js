#!/usr/bin/env node

/**
 * Bloom Universal MCP Wrapper
 * 
 * This wrapper automatically detects whether the target is:
 * - An npm package (e.g., @modelcontextprotocol/server-github, firecrawl-mcp)
 * - A local file path (e.g., ./my-server.js, /path/to/server.js)
 * 
 * Usage:
 * "command": "bloom-wrapper"
 * "args": ["@modelcontextprotocol/server-github"]
 * 
 * or
 * 
 * "command": "bloom-wrapper"
 * "args": ["firecrawl-mcp"]
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const BLOOM_AUTH = process.env.BLOOM_AUTH;
const BLOOM_PROXY = process.env.BLOOM_PROXY || getDefaultProxy();
const DEBUG = process.env.DEBUG || '';

function getDefaultProxy() {
  // In development/debug mode, use localhost
  if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
    return 'http://localhost:8000';
  }
  // In production, use the Bloom API
  return 'https://api.bloomtechnologies.app';
}

function debug(msg) {
  if (DEBUG.includes('bloom')) {
    console.error(`[bloom-wrapper] ${msg}`);
  }
}

function error(msg) {
  console.error(`[bloom-wrapper] ERROR: ${msg}`);
}

// Validate environment
if (!BLOOM_AUTH) {
  error('BLOOM_AUTH environment variable is required');
  process.exit(1);
}

// Get target from command line
const target = process.argv[2];
if (!target) {
  error('No MCP server specified');
  console.error('Usage: bloom-wrapper <mcp-server> [args...]');
  process.exit(1);
}

const targetArgs = process.argv.slice(3);

/**
 * Detect if the target is an npm package or a file path
 */
function detectTargetType(target) {
  // Check if it's a file path (absolute or relative)
  if (target.startsWith('/') || target.startsWith('./') || target.startsWith('../')) {
    return 'file';
  }
  
  // Check if it's a Windows absolute path
  if (/^[A-Za-z]:/.test(target)) {
    return 'file';
  }
  
  // Check if file exists in current directory
  if (fs.existsSync(target)) {
    return 'file';
  }
  
  // Otherwise, assume it's an npm package
  return 'npm';
}

const targetType = detectTargetType(target);
debug(`Target: ${target} (type: ${targetType})`);

// Build the spawn command based on target type
let command, args, loaderPath;

if (targetType === 'npm') {
  // For npm packages, use npx
  command = 'npx';
  args = ['-y', target, ...targetArgs];
  loaderPath = path.join(__dirname, 'bloom-proxy-loader.js');
} else {
  // For file paths, use node directly
  command = process.execPath;
  const resolvedPath = path.resolve(target);
  args = [resolvedPath, ...targetArgs];
  loaderPath = path.join(__dirname, 'bloom-proxy-loader.js');
}

// Spawn the process with injected loader
debug(`Spawning: ${command} ${args.join(' ')}`);

// Set up environment with dummy API keys for packages that require them
const childEnv = {
  ...process.env,
  // Inject our loader to intercept HTTP calls
  NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${loaderPath}`.trim(),
  BLOOM_AUTH,
  BLOOM_PROXY,
  DEBUG,
  MCP_SERVICE_NAME: process.env.MCP_SERVICE_NAME
};

// Add dummy API keys for common services if not already set
// The Bloom proxy will handle the actual authentication
if (!childEnv.FIRECRAWL_API_KEY) {
  childEnv.FIRECRAWL_API_KEY = 'dummy-key-handled-by-bloom-proxy';
}
if (!childEnv.OPENAI_API_KEY) {
  childEnv.OPENAI_API_KEY = 'dummy-key-handled-by-bloom-proxy';
}
if (!childEnv.ANTHROPIC_API_KEY) {
  childEnv.ANTHROPIC_API_KEY = 'dummy-key-handled-by-bloom-proxy';
}

const child = spawn(command, args, {
  stdio: 'inherit',
  env: childEnv
});

// Handle child process events
child.on('error', (err) => {
  error(`Failed to start MCP server: ${err.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  debug(`MCP server exited with code ${code} and signal ${signal}`);
  process.exit(code || 0);
});

// Forward signals to child
process.on('SIGINT', () => {
  debug('Received SIGINT, forwarding to child');
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  debug('Received SIGTERM, forwarding to child');
  child.kill('SIGTERM');
});

debug('Wrapper started successfully');