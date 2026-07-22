import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.globalchain.app',
  appName: 'Global-Chain',
  webDir: '.output/public',
  server: {
    url: 'http://10.130.65.141:8080',
    cleartext: true,
  },
};

export default config;
