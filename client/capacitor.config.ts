import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.englishexam',
  appName: 'english-exam-app',
  webDir: 'dist',
  plugins: {
    CapacitorUpdater: {
      autoUpdate: false,
    },
    CapacitorHttp: {
      enabled: true,
    }
  }
};

export default config;
