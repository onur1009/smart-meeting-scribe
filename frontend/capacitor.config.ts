import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tubescribe.smartmeeting',
  appName: 'Smart Meeting Scribe',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
