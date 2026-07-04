import React, { useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { VideoContentFit, VideoView, useVideoPlayer } from 'expo-video';

interface Props {
  uri: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: VideoContentFit;
  nativeControls?: boolean;
  playing?: boolean;
  onPlaybackEnd?: () => void;
}

export default function AppVideo({
  uri,
  style,
  contentFit = 'contain',
  nativeControls = true,
  playing = false,
  onPlaybackEnd,
}: Props) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.muted = false;
  });

  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [player, playing]);

  useEffect(() => {
    if (!onPlaybackEnd) return undefined;
    const subscription = player.addListener('playToEnd', onPlaybackEnd);
    return () => subscription.remove();
  }, [onPlaybackEnd, player]);

  return (
    <VideoView
      player={player}
      style={style}
      contentFit={contentFit}
      nativeControls={nativeControls}
    />
  );
}
