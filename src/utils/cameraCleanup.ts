import * as FileSystem from 'expo-file-system/legacy';

/**
 * Clean up VisionCamera temporary files from the cache directory.
 * These accumulate from react-native-vision-camera recordings.
 */
export async function cleanupCameraCache(): Promise<number> {
  let deleted = 0;
  try {
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) return 0;
    const files = await FileSystem.readDirectoryAsync(cacheDir);
    const tempVideos = files.filter(
      (f) =>
        f.endsWith('.mp4') ||
        f.endsWith('.mov') ||
        f.endsWith('.tmp') ||
        f.startsWith('mrousavy') ||
        f.startsWith('video') ||
        f.startsWith('recording') ||
        f.startsWith('Camera'),
    );
    await Promise.all(
      tempVideos.map((f) =>
        FileSystem.deleteAsync(`${cacheDir}${f}`, { idempotent: true })
          .then(() => { deleted++; })
          .catch(() => {}),
      ),
    );
  } catch (e) {
    console.log('Camera cache cleanup error:', e);
  }
  return deleted;
}

/**
 * Delete all emergency files from the document directory
 * (recordings + photos matching "emergency" in name).
 */
export async function deleteAllEmergencyFiles(): Promise<void> {
  const docDir = FileSystem.documentDirectory || '';
  const files = await FileSystem.readDirectoryAsync(docDir);
  const emergencyFiles = files.filter(
    (f) =>
      f.includes('emergency') &&
      (f.endsWith('.mp4') || f.endsWith('.jpg') || f.endsWith('.mov')),
  );
  await Promise.all(
    emergencyFiles.map((f) =>
      FileSystem.deleteAsync(`${docDir}${f}`, { idempotent: true }).catch(() => {}),
    ),
  );
}
