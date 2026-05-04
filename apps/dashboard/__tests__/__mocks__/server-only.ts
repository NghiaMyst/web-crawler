// Mock for 'server-only' package — prevents the build-time guard from throwing in tests.
// In production, importing this package from a client bundle causes a build error.
// In tests we simply no-op it so we can test server-side modules directly.
export {};
