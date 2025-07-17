// network-interceptor.js - Production version
const http = require('http');
const https = require('https');
const url = require('url');

// Only intercept if enabled
if (process.env.BLOOM_INTERCEPT_ENABLED !== 'true') {
  return;
}

const config = {
  service: process.env.BLOOM_INTERCEPT_SERVICE,
  proxyBase: process.env.BLOOM_INTERCEPT_PROXY,
  orgKey: process.env.BLOOM_INTERCEPT_ORG_KEY,
  agentId: process.env.BLOOM_INTERCEPT_AGENT_ID,
  debug: process.env.BLOOM_INTERCEPT_DEBUG === 'true'
};

// Debug logging
function debug(...args) {
  if (config.debug) {
    console.error('[bloom-proxy]', ...args);
  }
}

debug('Interceptor loaded with config:', {
  service: config.service,
  proxy: config.proxyBase,
  orgKey: config.orgKey ? config.orgKey.substring(0, 10) + '...' : 'missing',
  agentId: config.agentId || 'missing'
});

// Whitelist of hosts that should NOT be intercepted
const WHITELIST = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'registry.npmjs.org',
  'registry.yarnpkg.com',
  'api.bloomtechnologies.app',
  'bloomtechnologies.app',
  ...(config.proxyBase ? [new URL(config.proxyBase).hostname] : [])
];

// Service detection mapping
const SERVICE_MAP = {
  'api.github.com': 'github',
  'api.notion.com': 'notion',
  'slack.com': 'slack',
  'api.slack.com': 'slack',
  'api.openai.com': 'openai',
  'api.anthropic.com': 'anthropic',
  'api.firecrawl.dev': 'firecrawl',
  'api.hubspot.com': 'hubspot',
  'api.salesforce.com': 'salesforce',
  'api.stripe.com': 'stripe',
  'api.twilio.com': 'twilio'
};

// Store original methods
const originalHttpRequest = http.request;
const originalHttpsRequest = https.request;

// Helper functions
function shouldIntercept(urlString, hostname) {
  // Don't intercept if no config
  if (!config.orgKey || !config.agentId) {
    debug('Skipping interception - missing auth config');
    return false;
  }

  // Check whitelist
  if (WHITELIST.some(item => hostname?.includes(item))) {
    debug(`Skipping whitelisted host: ${hostname}`);
    return false;
  }

  // Only intercept known services unless service is explicitly specified
  const detectedService = detectService(hostname);
  if (!detectedService && !config.service) {
    debug(`Skipping unknown service: ${hostname}`);
    return false;
  }

  debug(`Will intercept: ${hostname} as service: ${detectedService || config.service}`);
  return true;
}

function detectService(hostname) {
  if (!hostname) return null;
  
  for (const [domain, service] of Object.entries(SERVICE_MAP)) {
    if (hostname.includes(domain)) {
      return service;
    }
  }
  
  return null;
}

function normalizeOptions(options, defaultProtocol) {
  if (typeof options === 'string') {
    options = url.parse(options);
  }
  
  const protocol = options.protocol || defaultProtocol;
  const hostname = options.hostname || options.host?.split(':')[0] || 'localhost';
  const port = options.port || (protocol === 'https:' ? 443 : 80);
  const pathname = options.pathname || options.path?.split('?')[0] || '/';
  const search = options.search || (options.path?.includes('?') ? '?' + options.path.split('?')[1] : '');
  
  const fullUrl = `${protocol}//${hostname}:${port}${pathname}${search}`;
  
  return {
    ...options,
    href: fullUrl,
    protocol,
    hostname,
    port,
    pathname,
    search
  };
}

function makeProxiedRequest(originalOptions, callback, originalMethod) {
  const service = detectService(originalOptions.hostname) || config.service;
  
  if (!service) {
    debug('No service detected, falling back to original request');
    return originalMethod.call(http, originalOptions, callback);
  }
  
  // Build proxy URL
  const proxyUrl = new URL(config.proxyBase);
  proxyUrl.pathname = `/proxy/${service}${originalOptions.pathname}`;
  proxyUrl.search = originalOptions.search || '';
  
  debug(`Proxying ${originalOptions.href} -> ${proxyUrl.href}`);
  
  // Build proxy request options
  const proxyOptions = {
    protocol: proxyUrl.protocol,
    hostname: proxyUrl.hostname,
    port: proxyUrl.port || (proxyUrl.protocol === 'https:' ? 443 : 80),
    path: proxyUrl.pathname + proxyUrl.search,
    method: originalOptions.method || 'GET',
    headers: {
      ...originalOptions.headers,
      'Authorization': `Bearer bloom_${config.orgKey}_agent_${config.agentId}`,
      'X-Original-Host': originalOptions.hostname,
      'X-Bloom-Intercepted': 'true',
      'host': proxyUrl.hostname
    }
  };
  
  // Make the proxied request
  const proxyProtocol = proxyUrl.protocol === 'https:' ? https : http;
  return originalMethod.call(proxyProtocol, proxyOptions, callback);
}

// Monkey-patch http.request
http.request = function(options, callback) {
  const opts = normalizeOptions(options, 'http:');
  
  if (shouldIntercept(opts.href, opts.hostname)) {
    return makeProxiedRequest(opts, callback, originalHttpRequest);
  }
  
  return originalHttpRequest.call(this, options, callback);
};

// Monkey-patch https.request
https.request = function(options, callback) {
  const opts = normalizeOptions(options, 'https:');
  
  if (shouldIntercept(opts.href, opts.hostname)) {
    return makeProxiedRequest(opts, callback, originalHttpRequest);
  }
  
  return originalHttpsRequest.call(this, options, callback);
};

// Patch convenience methods
http.get = function(options, callback) {
  return http.request(options, callback).end();
};

https.get = function(options, callback) {
  return https.request(options, callback).end();
};

debug('Network interceptor initialized successfully');