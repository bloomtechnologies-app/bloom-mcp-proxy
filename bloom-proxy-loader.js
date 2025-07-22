/**
 * Bloom Proxy Loader - Injected into MCP server process
 * This file intercepts HTTP/HTTPS requests and routes them through Bloom proxy
 */

const http = require('http');
const https = require('https');
const url = require('url');

// Get config from environment
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

if (!BLOOM_AUTH) {
  console.error('[bloom-proxy-loader] Warning: BLOOM_AUTH not set, interception disabled');
  return;
}

// Parse auth to get agent ID
const authMatch = BLOOM_AUTH.match(/bloom_org_(.+)_agent_(.+)$/);
if (!authMatch) {
  console.error('[bloom-proxy-loader] Warning: Invalid BLOOM_AUTH format');
  return;
}

const agentId = authMatch[2];

function debug(msg) {
  if (DEBUG.includes('bloom')) {
    console.error(`[bloom-proxy] ${msg}`);
  }
}

debug(`Initializing - Agent: ${agentId}, Proxy: ${BLOOM_PROXY}`);

// Get service name from environment variable or use a default
const MCP_SERVICE_NAME = process.env.MCP_SERVICE_NAME;

function extractServiceName(hostname) {
  // Use environment variable if provided
  if (MCP_SERVICE_NAME) {
    return MCP_SERVICE_NAME;
  }
  
  // Otherwise, use a generic name
  // The backend should be updated to not require specific service names
  return 'mcp';
}

// Store original methods
const originalHttpRequest = http.request;
const originalHttpsRequest = https.request;
const originalHttpGet = http.get;
const originalHttpsGet = https.get;

// Parse proxy URL once
const proxyUrl = url.parse(BLOOM_PROXY);
const proxyHost = proxyUrl.hostname;

function shouldIntercept(options) {
  if (!options) return false;
  
  const hostname = options.hostname || options.host || '';
  
  // Don't intercept bloom proxy itself
  if (hostname === proxyHost || hostname.includes(proxyHost)) {
    return false;
  }
  
  // Don't intercept localhost unless specified
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return false;
  }
  
  // Don't intercept internal IPs
  if (hostname.match(/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/)) {
    return false;
  }
  
  // Don't intercept npm registry and package management
  if (hostname.includes('registry.npmjs.org') || 
      hostname.includes('registry.yarnpkg.com') ||
      hostname.includes('unpkg.com') || 
      hostname.includes('cdn.jsdelivr.net')) {
    return false;
  }
  
  return true;
}

function createInterceptor(originalMethod, protocol) {
  return function(urlOrOptions, options, callback) {
    // Normalize arguments (http.request has multiple signatures)
    let requestOptions;
    
    if (typeof urlOrOptions === 'string') {
      requestOptions = url.parse(urlOrOptions);
      if (typeof options === 'function') {
        callback = options;
        options = {};
      } else {
        options = options || {};
      }
      requestOptions = { ...requestOptions, ...options };
    } else {
      requestOptions = urlOrOptions || {};
      if (typeof options === 'function') {
        callback = options;
      } else if (options) {
        requestOptions = { ...requestOptions, ...options };
      }
    }
    
    // Check if we should intercept
    if (!shouldIntercept(requestOptions)) {
      debug(`Bypassing: ${requestOptions.hostname || requestOptions.host}`);
      return originalMethod.call(this, urlOrOptions, options, callback);
    }
    
    // Extract details
    const hostname = requestOptions.hostname || requestOptions.host || '';
    const serviceName = extractServiceName(hostname);
    const originalPath = requestOptions.path || requestOptions.pathname || '/';
    
    // Build proxy path
    const proxyPath = `/proxy/${serviceName}${originalPath}`;
    
    debug(`Intercepting ${requestOptions.method || 'GET'} ${hostname}${originalPath} -> ${serviceName}`);
    
    // Create proxy request options
    const proxyOptions = {
      protocol: proxyUrl.protocol,
      hostname: proxyUrl.hostname,
      port: proxyUrl.port || (proxyUrl.protocol === 'https:' ? 443 : 80),
      path: proxyPath,
      method: requestOptions.method || 'GET',
      headers: {
        ...requestOptions.headers,
        'X-Original-Host': hostname,
        'X-Service-Name': serviceName,
        'X-MCP-Service': serviceName
      }
    };
    
    // Remove headers that might conflict with proxy or contain original auth
    delete proxyOptions.headers.host;
    delete proxyOptions.headers.Host;
    delete proxyOptions.headers.authorization;
    delete proxyOptions.headers.Authorization;
    delete proxyOptions.headers['x-api-key'];
    delete proxyOptions.headers['X-API-KEY'];
    
    // NOW add the Bloom auth header (after removing the original ones)
    proxyOptions.headers['Authorization'] = `Bearer ${BLOOM_AUTH}`;
    proxyOptions.headers['X-Agent-ID'] = agentId;
    
    // Create the proxy request
    const ProxyModule = proxyUrl.protocol === 'https:' ? https : http;
    const proxyReq = ProxyModule.request(proxyOptions, callback);
    
    // For now, don't modify request bodies to avoid JSON corruption
    // The agent_id can be passed via headers or query params instead
    debug(`Request will be forwarded as-is to avoid body corruption`);
    
    // Log errors
    proxyReq.on('error', (err) => {
      debug(`Proxy request error: ${err.message}`);
    });
    
    return proxyReq;
  };
}

// Install interceptors
http.request = createInterceptor(originalHttpRequest, 'http:');
https.request = createInterceptor(originalHttpsRequest, 'https:');

// Also intercept convenience methods
http.get = function(urlOrOptions, options, callback) {
  const req = http.request(urlOrOptions, options, callback);
  req.end();
  return req;
};

https.get = function(urlOrOptions, options, callback) {
  const req = https.request(urlOrOptions, options, callback);
  req.end();
  return req;
};

debug('HTTP/HTTPS interception installed successfully');