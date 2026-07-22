import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.globalchain.app',
  appName: 'Global-Chain',
  webDir: '.output/public',
  server: {
    url: 'https://global-supply-chain-two.vercel.app',
    cleartext: true,
  },
};

export default config;
