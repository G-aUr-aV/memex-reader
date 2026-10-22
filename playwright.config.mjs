import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',fullyParallel:false,workers:1,timeout:30000,
  use:{baseURL:'http://localhost:4312',browserName:'chromium',headless:true,trace:'off'},
  webServer:{command:'node tests/fixture-server.mjs',url:'http://localhost:4312/readyz',reuseExistingServer:false,timeout:20000},
});
