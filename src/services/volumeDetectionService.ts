import { NativeModules, Platform } from 'react-native';

interface VolumeStatus {
  isMuted: boolean;
  isLow: boolean;
  currentVolume: number;
  maxVolume: number;
  volumePercentage: number;
}

class VolumeDetectionService {
  private readonly LOW_VOLUME_THRESHOLD = 0.15; // 15% or lower is considered low

  async getVolumeStatus(): Promise<VolumeStatus> {
    try {
      if (Platform.OS === 'android') {
        const { SystemSetting } = NativeModules;

        if (!SystemSetting || typeof SystemSetting.getVolume !== 'function' || typeof SystemSetting.getMaxVolume !== 'function') {
          return {
            isMuted: false,
            isLow: false,
            currentVolume: 0.5,
            maxVolume: 1.0,
            volumePercentage: 0.5,
          };
        }

        // Get current volume and max volume
        const currentVolume = await SystemSetting.getVolume('call');
        const maxVolume = await SystemSetting.getMaxVolume('call');

        const volumePercentage = currentVolume / maxVolume;
        const isMuted = currentVolume === 0;
        const isLow = volumePercentage > 0 && volumePercentage <= this.LOW_VOLUME_THRESHOLD;

        return {
          isMuted,
          isLow,
          currentVolume,
          maxVolume,
          volumePercentage,
        };
      } else {
        // iOS implementation would use AVAudioSession
        // For now, returning default values
        return {
          isMuted: false,
          isLow: false,
          currentVolume: 0.5,
          maxVolume: 1.0,
          volumePercentage: 0.5,
        };
      }
    } catch (error) {
      console.error('Error detecting volume:', error);
      // Return safe defaults on error
      return {
        isMuted: false,
        isLow: false,
        currentVolume: 0.5,
        maxVolume: 1.0,
        volumePercentage: 0.5,
      };
    }
  }

  getVolumeDescription(status: VolumeStatus): string {
    if (status.isMuted) {
      return 'MUTED';
    } else if (status.isLow) {
      return `LOW (${Math.round(status.volumePercentage * 100)}%)`;
    } else {
      return `NORMAL (${Math.round(status.volumePercentage * 100)}%)`;
    }
  }
}

export default new VolumeDetectionService();
