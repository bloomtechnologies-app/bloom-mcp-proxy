const { HTTPInterceptor } = require('../src/interceptor');
const { extractServiceName } = require('../src/config');
const http = require('http');
const https = require('https');

describe('HTTPInterceptor', () => {
  let interceptor;
  let config;
  
  beforeEach(() => {
    config = {
      bloomAuth: 'bloom_org_test123_agent_abc456',
      bloomProxy: 'http://localhost:8000',
      authInfo: {
        fullToken: 'bloom_org_test123_agent_abc456',
        orgKey: 'test123',
        agentId: 'abc456'
      },
      serviceConfigs: {}
    };
    
    interceptor = new HTTPInterceptor(config);
  });
  
  afterEach(() => {
    interceptor.uninstall();
  });
  
  describe('shouldProxy', () => {
    test('should not proxy requests to bloom proxy itself', () => {
      expect(interceptor.shouldProxy({ hostname: 'localhost', port: 8000 })).toBe(false);
    });
    
    test('should not proxy localhost requests', () => {
      expect(interceptor.shouldProxy({ hostname: 'localhost' })).toBe(false);
      expect(interceptor.shouldProxy({ hostname: '127.0.0.1' })).toBe(false);
    });
    
    test('should proxy external requests', () => {
      expect(interceptor.shouldProxy({ hostname: 'api.github.com' })).toBe(true);
      expect(interceptor.shouldProxy({ hostname: 'google.serper.dev' })).toBe(true);
    });
  });
  
  describe('buildProxyPath', () => {
    test('should build correct proxy path', () => {
      const options = { path: '/repos/user/repo' };
      const path = interceptor.buildProxyPath(options, 'github');
      expect(path).toBe('/proxy/github/repos/user/repo');
    });
    
    test('should handle missing path', () => {
      const options = {};
      const path = interceptor.buildProxyPath(options, 'github');
      expect(path).toBe('/proxy/github/');
    });
    
    test('should ensure path starts with /', () => {
      const options = { path: 'v1/models' };
      const path = interceptor.buildProxyPath(options, 'openai');
      expect(path).toBe('/proxy/openai/v1/models');
    });
  });
});

describe('extractServiceName', () => {
  test('should extract service names from known hosts', () => {
    expect(extractServiceName('api.github.com')).toBe('github');
    expect(extractServiceName('api.openai.com')).toBe('openai');
    expect(extractServiceName('google.serper.dev')).toBe('serper');
  });
  
  test('should extract first part of unknown hosts', () => {
    expect(extractServiceName('myapi.example.com')).toBe('myapi');
    expect(extractServiceName('service.company.io')).toBe('service');
  });
  
  test('should handle api prefix intelligently', () => {
    expect(extractServiceName('api.unknown.com')).toBe('unknown');
  });
});