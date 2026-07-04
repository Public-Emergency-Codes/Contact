/**
 * Silent-call chat types, quick responses, and status labels
 */
export interface ChatMessage {
  id: string;
  text: string;
  direction: 'user' | 'dispatcher' | 'system';
  timestamp: number;
  ttsStatus?: 'pending' | 'sending' | 'sent' | 'failed';
}

export interface SilentCallChatProps {
  /** Function to send message to PSAP via SMS */
  sendPsapMessage: (msg: string) => Promise<boolean>;
  /** Whether PSAP supports SMS */
  psapSmsCapable: boolean;
  /** Text scale multiplier */
  textScale?: number;
  /** Callback when user sends a message (for parent chat log) */
  onUserMessage?: (text: string) => void;
}

export const QUICK_RESPONSES = [
  { label: "I can't speak right now", text: "I cannot speak right now. I am in danger." },
  { label: 'Someone is in the house', text: "There is an intruder in my home. I cannot speak." },
  { label: 'I need police', text: 'I need law enforcement. I am hiding and cannot talk.' },
  { label: 'I need medical help', text: 'I need medical help but cannot speak aloud.' },
  { label: 'Send help to my location', text: 'Please send help to my current GPS location.' },
  { label: "I'm being followed", text: "I am being followed and cannot speak safely." },
];

export function getTtsStatusLabel(status?: string): string {
  switch (status) {
    case 'pending': return '⏳ Sending...';
    case 'sending': return '📨 Sending to dispatcher...';
    case 'sent': return '✓ Sent to dispatcher';
    case 'failed': return '⚠ Delivery failed';
    default: return '';
  }
}
