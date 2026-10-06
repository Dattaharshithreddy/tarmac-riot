import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useKeepAwake } from 'expo-keep-awake';
import GAME_HTML from './game-html';

const KEY = 'tarmac-riot-save-v1';

export default function App() {
  useKeepAwake();
  const [save, setSave] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    AsyncStorage.getItem(KEY).then((v) => setSave(v)).catch(() => setSave(null));
  }, []);

  if (save === undefined) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  // Hand the saved progress to the game before it starts.
  const inject = `window.__TR_SAVE__ = ${JSON.stringify(save)}; true;`;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar hidden />
      <WebView
        source={{ html: GAME_HTML, baseUrl: 'https://tarmacriot.local/' }}
        originWhitelist={['*']}
        injectedJavaScriptBeforeContentLoaded={inject}
        onMessage={(e) => {
          try {
            const m = JSON.parse(e.nativeEvent.data);
            if (m && m.type === 'save' && typeof m.data === 'string') AsyncStorage.setItem(KEY, m.data).catch(() => {});
          } catch { /* ignore */ }
        }}
        javaScriptEnabled
        domStorageEnabled
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        overScrollMode="never"
        bounces={false}
        setBuiltInZoomControls={false}
        androidLayerType="hardware"
        style={{ flex: 1, backgroundColor: '#000' }}
      />
    </View>
  );
}
