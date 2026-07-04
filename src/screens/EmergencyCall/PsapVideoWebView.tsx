import React, { useState } from 'react';
import { View, ActivityIndicator, TouchableOpacity } from 'react-native';
import WebView from 'react-native-webview';
import AppText from '../../components/AppText';

/**
 * PsapVideoWebView
 *
 * Renders an in-app WebView pointed at a PSAP video session URL.
 * The WebView spoofs a standard Chrome user-agent so PSAP platform pages
 * don't block it, and auto-grants camera + microphone permissions via
 * onPermissionRequest so the dispatcher's WebRTC session starts without
 * any extra taps from the user.
 *
 * The full redirect chain and session cookie handshake run inside the
 * WebView exactly as they would in a browser — no token parsing or SDK
 * partnership is needed.
 */

// Spoof a real Android Chrome UA so PSAP platforms don't block WebView.
const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

interface Props {
  url: string;
  colors: any;
  fs: (n: number) => number;
  onDismiss: () => void;
}

export const PsapVideoWebView: React.FC<Props> = ({ url, colors, fs, onDismiss }) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <View
      style={{
        borderRadius: 12,
        overflow: 'hidden',
        marginHorizontal: 12,
        marginBottom: 12,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {/* ── Header ── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: colors.surfaceAlt,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        {/* Green "live" dot */}
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#22C55E',
            marginRight: 6,
          }}
        />
        <AppText
          style={{
            flex: 1,
            fontSize: fs(12),
            fontWeight: '600',
            color: colors.textPrimary,
          }}
        >
          Dispatcher Video Session
        </AppText>
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 4 }}
        >
          <AppText style={{ fontSize: fs(12), color: colors.textSecondary }}>
            Dismiss
          </AppText>
        </TouchableOpacity>
      </View>

      {/* ── Loading state ── */}
      {!loaded && (
        <View
          style={{ height: 240, justifyContent: 'center', alignItems: 'center' }}
        >
          <ActivityIndicator color={colors.primary ?? '#DC2626'} size="large" />
          <AppText
            style={{
              marginTop: 10,
              fontSize: fs(12),
              color: colors.textSecondary,
            }}
          >
            Connecting to dispatcher camera…
          </AppText>
        </View>
      )}

      {/* ── WebView ── */}
      <WebView
        source={{ uri: url }}
        style={{ height: 300, opacity: loaded ? 1 : 0 }}
        userAgent={CHROME_UA}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        // Auto-grant camera + microphone — CAMERA and RECORD_AUDIO are already
        // declared in AndroidManifest so this just confirms the WebView grant.
        onPermissionRequest={(req: any) => {
          try { req.grant(req.resources); } catch {}
        }}
        onLoadEnd={() => setLoaded(true)}
        onError={(e) =>
          console.warn('[PsapVideoWebView] load error:', e.nativeEvent)
        }
        originWhitelist={[
          'https://*.rapidsos.com',
          'https://*.carbyne.com',
          'https://*.carbyne911.com',
          'https://*.prepared.com',
          'https://*.rapiddeploy.com',
          'https://*.ravemobilesafety.com',
        ]}
        mixedContentMode="never"
      />
    </View>
  );
};
