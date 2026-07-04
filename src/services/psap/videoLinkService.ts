/** Only known PSAP video-provider domains may be loaded in the video WebView. */
const PSAP_VIDEO_PATTERNS: RegExp[] = [
  /https:\/\/[a-z0-9-]+\.rapidsos\.com\/[^\s"')>\u200B\uFEFF]+/i,
  /https:\/\/[a-z0-9-]+\.carbyne\.com\/[^\s"')>\u200B\uFEFF]+/i,
  /https:\/\/[a-z0-9-]+\.carbyne911\.com\/[^\s"')>\u200B\uFEFF]+/i,
  /https:\/\/[a-z0-9-]+\.prepared\.com\/[^\s"')>\u200B\uFEFF]+/i,
  /https:\/\/[a-z0-9-]+\.rapiddeploy\.com\/[^\s"')>\u200B\uFEFF]+/i,
  /https:\/\/[a-z0-9-]+\.ravemobilesafety\.com\/[^\s"')>\u200B\uFEFF]+/i,
];

export function extractPsapVideoUrl(body: string): string | null {
  for (const pattern of PSAP_VIDEO_PATTERNS) {
    const match = body.match(pattern);
    if (match) return match[0];
  }
  return null;
}
