#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Production configuration
const BLOOM_PROXY_PROD = 'https://api.bloomtechnologies.app';
const BLOOM_PROXY_DEV = 'http://localhost:8000';

// Version check
const MIN_NODE_VERSION = '14.0.0';
const nodeVersion = process.version.slice(1);
if (nodeVersion < MIN_NODE_VERSION) {
  console.error(`Error: Node.js ${MIN_NODE_VERSION} or higher is required. You have ${process.version}`);
  process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2);

// Handle help and version
if (args.includes('--help') || args.includes('-h')) {
  showHelp();
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  const pkg = require('./package.json');
  console.log(pkg.version);
  process.exit(0);
}

const mcpServerPackage = args[0];
const mcpArgs = args.slice(1);

if (!mcpServerPackage) {
  console.error('Error: MCP server package name is required\n');
  showHelp();
  process.exit(1);
}

// Get Bloom configuration
const config = {
    auth: process.env.BLOOM_AUTH,
    service: process.env.BLOOM_SERVICE,
    proxy: process.env.BLOOM_PROXY || BLOOM_PROXY_PROD, // Default to production
    debug: process.env.BLOOM_DEBUG === 'true',
    dev: process.env.BLOOM_DEV === 'true' // New dev mode flag
};

// Override proxy URL in dev mode
if (config.dev && !process.env.BLOOM_PROXY) {
    config.proxy = BLOOM_PROXY_DEV;
    console.log('🔧 Development mode - using local proxy');
}
  

// Validate configuration
if (!config.auth) {
  console.error('Error: BLOOM_AUTH environment variable is required');
  console.error('\nExample usage:');
  console.error('BLOOM_AUTH="bloom_key_XXX_agent_YYY" bloom-mcp-proxy @modelcontextprotocol/server-github\n');
  process.exit(1);
}

// Parse auth token
let orgKey = '';
let agentId = '';
try {
  if (config.auth.includes('_agent_')) {
    const parts = config.auth.split('_agent_');
    orgKey = parts[0].replace('bloom_', '');
    agentId = parts[1];
  } else {
    throw new Error('Invalid BLOOM_AUTH format');
  }
} catch (error) {
  console.error('Error: Invalid BLOOM_AUTH format. Expected: bloom_key_XXX_agent_YYY');
  process.exit(1);
}

// Debug logging
if (config.debug) {
  console.log('🔍 Debug mode enabled');
  console.log('Configuration:', {
    service: config.service,
    proxy: config.proxy,
    orgKey: orgKey.substring(0, 10) + '...',
    agentId: agentId
  });
}

// Show startup message
console.log('🚀 Starting MCP server with Bloom proxy...');
console.log(`📦 Package: ${mcpServerPackage}`);
console.log(`🔌 Service: ${config.service || 'auto-detect'}`);
console.log(`🌐 Proxy: ${config.proxy}`);
if (config.proxy === BLOOM_PROXY_PROD) {
  console.log('☁️  Using Bloom cloud proxy');
}

// Path to network interceptor
const interceptorPath = path.join(__dirname, 'network-interceptor.js');

// Verify interceptor exists
if (!fs.existsSync(interceptorPath)) {
  console.error('Error: network-interceptor.js not found');
  process.exit(1);
}

// Determine how to run the MCP server
let command, commandArgs;

// Check if it's a local file
const isLocalFile = mcpServerPackage.startsWith('./') || 
                    mcpServerPackage.startsWith('../') || 
                    mcpServerPackage.startsWith('/') ||
                    fs.existsSync(mcpServerPackage);

if (isLocalFile) {
  command = 'node';
  commandArgs = [mcpServerPackage, ...mcpArgs];
  console.log(`📁 Running local MCP server: ${mcpServerPackage}`);
} else {
  // Check if globally installed
  try {
    const globalPath = execSync(`which ${mcpServerPackage} 2>/dev/null`, { encoding: 'utf8' }).trim();
    if (globalPath) {
      command = globalPath;
      commandArgs = mcpArgs;
      console.log(`🌍 Found global command: ${globalPath}`);
    }
  } catch (e) {
    // Not globally installed, use npx
    command = 'npx';
    commandArgs = ['--yes', mcpServerPackage, ...mcpArgs];
    console.log(`📥 Installing and running via npx: ${mcpServerPackage}`);
  }
}

// Build environment
const childEnv = {
  ...process.env,
  NODE_OPTIONS: `--require "${interceptorPath}" ${process.env.NODE_OPTIONS || ''}`.trim(),
  BLOOM_INTERCEPT_SERVICE: config.service || extractServiceName(mcpServerPackage),
  BLOOM_INTERCEPT_PROXY: config.proxy,
  BLOOM_INTERCEPT_ORG_KEY: orgKey,
  BLOOM_INTERCEPT_AGENT_ID: agentId,
  BLOOM_INTERCEPT_ENABLED: 'true',
  BLOOM_INTERCEPT_DEBUG: config.debug ? 'true' : 'false'
};

// Spawn the MCP server
const mcp = spawn(command, commandArgs, {
  stdio: 'inherit',
  env: childEnv,
  shell: true
});

// Handle errors
mcp.on('error', (err) => {
  console.error('❌ Failed to start MCP server:', err.message);
  if (err.code === 'ENOENT') {
    console.error('💡 Make sure the MCP server package is installed or use a valid path');
  }
  process.exit(1);
});

// Handle signals
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  mcp.kill('SIGINT');
});

process.on('SIGTERM', () => {
  mcp.kill('SIGTERM');
});

// Forward exit codes
mcp.on('exit', (code, signal) => {
  if (signal) {
    console.log(`🛑 MCP server terminated by signal ${signal}`);
    process.exit(1);
  } else if (code !== 0 && code !== null) {
    console.error(`❌ MCP server exited with code ${code}`);
    process.exit(code);
  } else {
    process.exit(0);
  }
});

function extractServiceName(packageName) {
  return packageName
    .replace('@modelcontextprotocol/server-', '')
    .replace('mcp-server-', '')
    .replace('-mcp', '');
}

function showHelp() {
  console.log(`
bloom-mcp-proxy - Universal MCP wrapper for Bloom authentication

Usage:
  bloom-mcp-proxy <mcp-server-package> [mcp-args...]

Environment Variables:
  BLOOM_AUTH     Required. Format: bloom_key_XXX_agent_YYY
  BLOOM_SERVICE  Optional. Service name (auto-detected if not specified)
  BLOOM_PROXY    Optional. Proxy URL (default: https://api.bloomtechnologies.app)
  BLOOM_DEBUG    Optional. Enable debug logging (true/false)

Examples:
  # Run GitHub MCP server
  BLOOM_AUTH="bloom_key_abc123_agent_xyz789" bloom-mcp-proxy @modelcontextprotocol/server-github

  # Run local MCP server
  BLOOM_AUTH="bloom_key_abc123_agent_xyz789" bloom-mcp-proxy ./my-mcp-server.js

  # With custom proxy URL
  BLOOM_PROXY="https://api.bloom.com" BLOOM_AUTH="..." bloom-mcp-proxy github-mcp

Options:
  -h, --help     Show this help message
  -v, --version  Show version number
`);
}