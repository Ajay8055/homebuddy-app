import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.homebuddy.app',
  appName: 'HomeBuddy',
  webDir: 'dist',
  bundledWebRuntime: false,
  backgroundColor: '#f7f8f4',
  android: {
    backgroundColor: '#f7f8f4'
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#f7f8f4'
  }
};

export default config;
