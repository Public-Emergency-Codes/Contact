import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import AppText from '../../components/AppText';

const Text = AppText;

interface Props {
  msg: any;
  styles: any;
  fs: (n: number) => number;
}

const formatTime = (value: number) => {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

/**
 * "Trying to connect to your video stream" bubble with an animated 3-dot
 * loading indicator. Shown while the video-call flow waits for the dispatcher.
 * It is removed by useEmergencyVideoCall as soon as the dispatcher sends any text.
 */
export const VideoConnectingBubble: React.FC<Props> = ({ msg, styles, fs }) => {
  const [dots, setDots] = useState('');
  const timeStr = formatTime(Number(msg?.timestamp || msg?.sessionId || Date.now()));

  useEffect(() => {
    const id = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 450);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={[styles.previewCard, { marginBottom: 12 }]}>
      <View style={styles.chatSection}>
        <View style={styles.chatRowLeft}>
          <View style={[styles.chatBubbleLeft, { paddingTop: 10, paddingBottom: 10, paddingHorizontal: 12 }]}>
            <Text style={[styles.chatText, { fontSize: fs(13), lineHeight: fs(18) }]}>
              Trying to connect to your video stream{dots}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingTop: 6, paddingBottom: 1, paddingLeft: 0, paddingRight: 0 }}>
              <View style={{ backgroundColor: '#DC2626', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                <AppText style={{ color: '#FFFFFF', fontSize: fs(8), fontWeight: '700', lineHeight: fs(11) }}>Automated</AppText>
              </View>
              <AppText style={{ color: '#FFFFFF', fontSize: fs(9), lineHeight: fs(12) }}>{timeStr}</AppText>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

export default VideoConnectingBubble;
