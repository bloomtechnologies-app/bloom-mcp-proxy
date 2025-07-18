# bloom-mcp-proxy

Universal MCP (Model Context Protocol) wrapper that adds Bloom authentication and authorization to any MCP server through Bloom's cloud proxy.

## Features

- 🔐 **Seamless Authentication**: Routes MCP server API calls through Bloom's cloud authentication proxy
- 🚀 **Zero Configuration**: Works with any MCP server without modification
- ☁️ **Cloud-Based**: Connects to Bloom's production API at `api.bloomtechnologies.app`
- 🎯 **Smart Detection**: Automatically detects and proxies calls to supported services
- 🛡️ **Security**: Never exposes API keys to MCP servers
- 📊 **Full Auditing**: All API calls are logged and monitored through Bloom

## Installation

```bash
npm install -g bloom-mcp-proxy
```
