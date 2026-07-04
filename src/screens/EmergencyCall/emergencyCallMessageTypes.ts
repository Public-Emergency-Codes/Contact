import type { Dispatch, SetStateAction } from 'react';

export interface EmergencyCallMessage {
  id?: string;
  type: 'chat' | 'location' | 'relocation' | 'user' | 'video' | 'video-connecting' | 'psap-video';
  text?: string;
  body?: string;
  incoming?: boolean;
  timestamp?: number;
  date?: number;
  imageUrl?: string;
  mediaMime?: string;
  address?: string;
  coords?: string;
  locationLine?: string;
  mapUrl?: string;
  responded?: 'yes' | 'no' | null;
  aboveLocation?: boolean;
  historyOnly?: boolean;
  stopped?: boolean;
  restartConsumed?: boolean;
  sessionId?: number;
  ttsStatus?: 'pending' | 'sending' | 'sent' | 'failed';
  [key: string]: any;
}

export type EmergencyMessageStateSetter = Dispatch<SetStateAction<EmergencyCallMessage[]>>;
