/**
 * E911 Trace Service (local-device-only)
 *
 * Maintains an in-memory ring buffer of E911 call step traces that can be
 * dumped to console for debugging. Nothing is sent to any server.
 */

export interface TraceEntry {
  timestamp: number;
  stage: string;
  eventId: string | null;
  payload: Record<string, unknown>;
}

const MAX_TRACES = 200;

class EmergencyCallTraceService {
  private buffer: TraceEntry[] = [];
  private traceId = 0;

  async trace(stage: string, payload: Record<string, unknown> = {}, eventId: string | null = null) {
    try {
      const entry: TraceEntry = {
        timestamp: Date.now(),
        stage,
        eventId,
        payload,
      };
      this.buffer.push(entry);
      if (this.buffer.length > MAX_TRACES) {
        this.buffer.shift();
      }
      this.traceId++;
      if (__DEV__) console.log('[E911Trace]', stage, eventId ?? '', JSON.stringify(payload).slice(0, 200));
    } catch {
      // Tracing must never block emergency flow.
    }
  }

  /** Return all buffered traces (copy so caller can't mutate). */
  getTraces(): TraceEntry[] {
    return [...this.buffer];
  }

  /** Return traces for a specific event. */
  getTracesForEvent(eventId: string): TraceEntry[] {
    return this.buffer.filter((t) => t.eventId === eventId);
  }

  /** Clear the buffer. */
  clear() {
    this.buffer = [];
    this.traceId = 0;
  }

  /** Dump the full buffer to console as a formatted table. */
  dumpToConsole() {
    if (this.buffer.length === 0) {
      console.log('[E911Trace] Buffer is empty.');
      return;
    }
    console.log('═══════════════════════════════════════════');
    console.log(`  E911 Trace Buffer (${this.buffer.length} entries)`);
    console.log('───────────────────────────────────────────');
    for (const t of this.buffer) {
      const time = new Date(t.timestamp).toISOString().slice(11, 23);
      console.log(`  ${time}  ${t.stage.padEnd(40)}  ${t.eventId ?? ''}`);
    }
    console.log('═══════════════════════════════════════════');
  }
}

export default new EmergencyCallTraceService();
