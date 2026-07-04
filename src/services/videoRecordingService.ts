/**
 * Global video recording state service.
 *
 * Tracks whether a recording session was started from the CommunicationHubScreen so
 * EmergencyCallScreen can seamlessly continue the camera experience without
 * interruption.  Also stores paths of saved clips so they can be stitched
 * or listed later.
 */

type RecordingOrigin = 'home' | 'e911' | 'record-screen' | null;

class VideoRecordingService {
  private _origin: RecordingOrigin = null;
  private _isActive = false;
  private _savedClips: string[] = [];
  private _listeners = new Set<() => void>();

  private emit() {
    this._listeners.forEach((listener) => {
      try { listener(); } catch {}
    });
  }

  /** Mark that a recording session has been started. */
  start(origin: RecordingOrigin) {
    const changed = this._origin !== origin || !this._isActive;
    this._origin = origin;
    this._isActive = true;
    if (changed) this.emit();
  }

  /** Mark that the current session has ended. */
  stop() {
    const changed = this._isActive || this._origin !== null;
    this._isActive = false;
    this._origin = null;
    if (changed) this.emit();
  }

  /** End the current session only when it was started by the supplied origin. */
  stopIfOrigin(origin: Exclude<RecordingOrigin, null>) {
    if (this._origin !== origin) return;
    this.stop();
  }

  /** Whether a session is logically "in progress" (camera should be live). */
  get isActive(): boolean {
    return this._isActive;
  }

  /** Where the recording was originally initiated. */
  get origin(): RecordingOrigin {
    return this._origin;
  }

  /** Was the recording started from the Home screen? */
  get startedFromHome(): boolean {
    return this._origin === 'home';
  }

  /** Append a saved clip path. */
  addClip(path: string) {
    this._savedClips.push(path);
  }

  /** Get all saved clip paths. */
  get clips(): string[] {
    return [...this._savedClips];
  }

  /** Clear saved clips (e.g. after upload / merge). */
  clearClips() {
    this._savedClips = [];
  }

  /** Subscribe to active/origin changes. */
  subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /** Snapshot for React state consumers. */
  getSnapshot() {
    return { isActive: this._isActive, origin: this._origin };
  }
}

export default new VideoRecordingService();
