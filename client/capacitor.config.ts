import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.englishexam',
  appName: 'english-exam-app',
  webDir: 'dist',
  plugins: {
    CapacitorUpdater: {
      autoUpdate: false, // 我们选择手动控制更新时机，配合 UI 提示
    }
  }
};

export default config;
