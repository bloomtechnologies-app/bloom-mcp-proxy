# Bloom MCP Proxy Wrapper

A universal wrapper for Model Context Protocol (MCP) servers that routes all external API calls through the Bloom proxy platform, providing authentication, observability, and access control.

**Simple and consistent usage for all MCP server types:**
- NPM packages (e.g., `@modelcontextprotocol/server-github`, `firecrawl-mcp`)
- Local scripts (e.g., `./my-mcp-server.js`)
- No absolute paths required!
- Automatic environment detection (localhost for dev, production API for prod)

## Installation

```bash
npm install -g bloom-mcp-wrapper
```

## Quick Start

Add MCP servers to your Claude Desktop configuration using `bloom-mcp-wrapper`:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "bloom-mcp-wrapper", "@modelcontextprotocol/server-github"],
      "env": {
        "BLOOM_AUTH": "your-bloom-auth-token",
        "MCP_SERVICE_NAME": "github"
      }
    },
    "firecrawl": {
      "command":"npx",
      "args": ["-y", "bloom-mcp-wrapper", "firecrawl-mcp"],
      "env": {
        "BLOOM_AUTH": "your-bloom-auth-token",
        "MCP_SERVICE_NAME": "firecrawl"
      }
    },
    "custom-local": {
      "command": "npx",
      "args": ["-y", "bloom-mcp-wrapper", "./my-custom-mcp-server.js"],
      "env": {
        "BLOOM_AUTH": "your-bloom-auth-token",
        "MCP_SERVICE_NAME": "custom"
      }
    }
  }
}
```

## Environment Variables

- **`BLOOM_AUTH`** (required): Your Bloom authentication token
- **`BLOOM_PROXY`** (optional): Custom proxy URL (defaults to localhost:8000 in dev, production API in prod)
- **`DEBUG`** (optional): Set to `bloom` to enable debug logging
- **`NODE_ENV`** (optional): Set to `development` to force localhost proxy

## How It Works

The wrapper:
1. **Auto-detects** whether the target is an npm package or local file
2. **Spawns** the MCP server using the appropriate method (`npx` for packages, `node` for files)
3. **Intercepts** all HTTP/HTTPS requests made by the MCP server
4. **Routes** them through the Bloom proxy for authentication and monitoring
5. **Provides** dummy API keys automatically (no need to configure service-specific keys)

## Environment Detection

- **Development/Debug**: Routes to `http://localhost:8000` when `NODE_ENV=development` or `DEBUG` is set
- **Production**: Routes to `https://api.bloomtechnologies.app` by default

## Features

✅ **Universal compatibility**: Works with any MCP server  
✅ **Zero configuration**: No need to set up service-specific API keys  
✅ **Auto-detection**: Automatically handles npm packages vs local files  
✅ **Environment-aware**: Different routing for dev vs production  
✅ **Debug-friendly**: Comprehensive logging when needed  
✅ **Lightweight**: No external dependencies  

## Examples

### NPM Packages (Scoped)
```bash
bloom-wrapper @modelcontextprotocol/server-github
```

### NPM Packages (Unscoped)  
```bash
bloom-wrapper firecrawl-mcp
```

### Local Files
```bash
bloom-wrapper ./my-server.js
bloom-wrapper /absolute/path/to/server.js
```

### With Debug Logging
```bash
DEBUG=bloom bloom-wrapper @modelcontextprotocol/server-github
```

## Environment Variables

### Required Variables
- `BLOOM_AUTH`: Your Bloom authentication token
- `MCP_SERVICE_NAME`: The service name for permission checking (e.g., "github", "google_maps", "firecrawl")

### Optional Variables
- `BLOOM_PROXY`: Proxy URL (defaults to Bloom API)
- `DEBUG`: Set to "bloom" for debug logging

## License

MIT

## Support

For issues and questions, please visit: https://github.com/bloomtechnologies-app/bloom-mcp-proxy/issues
