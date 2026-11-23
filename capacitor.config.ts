import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.castforge.studio',
  appName: 'CastForge Studio',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: ['*'],
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
    backgroundColor: '#0B0D10',
    buildOptions: {
      keystorePath: 'keystore/castforge-auto.keystore',
      keystoreAlias: 'castforge',
      releaseType: 'APK',
    },
  },
  plugins: {
    StreamEngine: {
      notificationChannelId: 'castforge_live_stream_channel',
      notificationChannelName: 'Live Broadcast Service',
    },
  },
};

export default config;
