import { NativeModules } from 'react-native';

const { DirectSms } = NativeModules;

export type DirectSmsAttachment = {
  uri: string;
  mimeType?: string;
};

export function isDirectSmsAvailable(): boolean {
  return !!DirectSms;
}

export async function sendDirectSmsText(
  address: string,
  text: string,
  threadId = '',
): Promise<void> {
  await DirectSms.sendSms(address, text, threadId);
}

export async function sendDirectMmsAttachments(
  address: string,
  text: string,
  attachments: DirectSmsAttachment[],
): Promise<void> {
  const uris = attachments.map(a => a.uri).filter(Boolean);
  if (uris.length === 0) return;

  const target = address.replace(/\D/g, '');
  const targetLabel = target.length > 4 ? `***${target.slice(-4)}` : address;
  console.log(
    `[DirectSmsMedia] sending MMS target=${targetLabel} textLen=${text.length} attachments=${uris.length} ` +
      `schemes=${uris.map(uri => uri.split(':', 1)[0] || 'unknown').join(',')}`,
  );

  if (uris.length === 1) {
    await DirectSms.sendMms(address, text, uris[0]);
    return;
  }

  await DirectSms.sendMmsImages(address, text, uris);
}
