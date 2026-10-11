/**
 * Hands bytes to a Java `java.nio.ByteBuffer` parameter without leaking them.
 *
 * Why this exists: NativeScript Android (9.0.4 through at least 9.1.1)
 * converts a JS ArrayBuffer or typed array passed to a Java method by wrapping
 * its backing store in `NewDirectByteBuffer` and taking a JNI global ref that is
 * never deleted (JsArgConverter.cpp, `buffer = env.NewGlobalRef(buffer)`). The
 * ByteBuffer is also linked to the JS ArrayBuffer as its native counterpart.
 * The leaked global ref keeps the ByteBuffer reachable forever, so the
 * runtime's GC handshake (Runtime.makeInstanceWeakAndCheckIfAlive) always says
 * "alive", the JS finalizer re-arms, and V8 never frees the ArrayBuffer. Every
 * call leaked its whole buffer plus one global ref.
 *
 * On the frame path that meant a full surface (576x260, 640x452 or 640x480
 * bytes) per submitted frame, including frames the Java side then discards as
 * unchanged. Measured on a Galaxy Z Fold7, native-heap growth matched frame
 * bytes submitted to within a few percent, and Samsung's Heimdall memory
 * manager killed the app at about 6.4 GB. ART also aborts the process once
 * 51,200 global refs are held, so the ref leak is a second ceiling behind the
 * memory one.
 *
 * The workaround keeps the conversion out of the call: the bytes are copied
 * into a Java-allocated direct ByteBuffer that is reused, through an
 * ArrayBuffer view made once with `ArrayBuffer.from` (an external backing
 * store over the Java memory, no global ref), and the Java ByteBuffer object
 * itself is passed. A JS proxy for an existing Java object takes the ordinary
 * object path, which does not leak.
 *
 * Contract: the buffer returned by load() is only valid until the next load()
 * on the same instance, so the Java callee must consume it synchronously and
 * not keep a reference. The Kotlin consumers (SurfaceCompositor via
 * AndroidByteReader, playBuzzerSequence, ShellScene.decode) copy or parse
 * before returning, which satisfies this. One instance belongs to one JS
 * context (main thread or one worker); instances are not shared across
 * isolates.
 */

declare const java: any;

/** Minimal surface of java.nio.ByteBuffer this module uses. */
export interface JavaByteBufferLike {
  clear(): unknown;
  limit(newLimit: number): unknown;
}

/** How to allocate a direct buffer and view its memory; injectable for tests. */
export interface DirectBufferBackend {
  allocateDirect(capacity: number): JavaByteBufferLike;
  viewOf(buffer: JavaByteBufferLike): Uint8Array;
}

const nativeScriptBackend: DirectBufferBackend = {
  allocateDirect: (capacity) => java.nio.ByteBuffer.allocateDirect(capacity),
  viewOf: (buffer) => new Uint8Array((ArrayBuffer as any).from(buffer)),
};

/** Capacity grows in steps of this many bytes, so a slowly growing payload does not reallocate every call. */
const CAPACITY_STEP_BYTES = 4096;

export class JavaDirectBuffer {
  private javaBuffer: JavaByteBufferLike | null = null;
  private view: Uint8Array | null = null;
  /** Number of Java buffers allocated so far (a test and diagnostics hook). */
  allocations = 0;

  constructor(
    private readonly initialCapacity = 0,
    private readonly backend: DirectBufferBackend = nativeScriptBackend,
  ) {}

  /**
   * Copy `bytes` into the reused Java buffer and return it with position 0 and
   * limit `bytes.length`, so `remaining()` equals the byte count. Valid until
   * the next load() on this instance.
   */
  load(bytes: Uint8Array): JavaByteBufferLike {
    const { javaBuffer, view } = this.reserve(bytes.length);
    view.set(bytes);
    javaBuffer.clear();
    javaBuffer.limit(bytes.length);
    return javaBuffer;
  }

  /** A copy of a Java byte[], moved with one bulk put instead of one bridge call per byte. */
  copyFromJava(javaBytes: any): Uint8Array {
    const length = Number(javaBytes?.length ?? 0);
    if (!length) return new Uint8Array(0);
    const { javaBuffer, view } = this.reserve(length);
    javaBuffer.clear();
    (javaBuffer as any).put(javaBytes);
    return view.slice(0, length);
  }

  /** A new Java byte[] holding `bytes`, filled with one bulk get. */
  copyToJavaArray(bytes: Uint8Array): any {
    const javaBytes = (Array as any).create("byte", bytes.length);
    if (bytes.length) (this.load(bytes) as any).get(javaBytes);
    return javaBytes;
  }

  private reserve(length: number): { javaBuffer: JavaByteBufferLike; view: Uint8Array } {
    if (!this.javaBuffer || !this.view || this.view.length < length) {
      const wanted = Math.max(length, this.initialCapacity, 1);
      const capacity = Math.ceil(wanted / CAPACITY_STEP_BYTES) * CAPACITY_STEP_BYTES;
      this.javaBuffer = this.backend.allocateDirect(capacity);
      this.view = this.backend.viewOf(this.javaBuffer);
      this.allocations++;
    }
    return { javaBuffer: this.javaBuffer, view: this.view };
  }

  /** As load(), for an optional ArrayBuffer (e.g. a frame's draw list); null stays null. */
  loadOptional(buffer: ArrayBuffer | null | undefined): JavaByteBufferLike | null {
    if (!buffer || buffer.byteLength === 0) return null;
    return this.load(new Uint8Array(buffer));
  }
}

/**
 * Copy `bytes` into a fresh Java direct buffer (position 0, limit
 * `bytes.length`) for a one-off crossing such as an atlas registration or a
 * file write. Unlike a JavaDirectBuffer nothing is pinned between calls: the
 * Java buffer is an ordinary object, freed once the JS side drops it.
 */
export function copyToJavaByteBuffer(
  bytes: Uint8Array,
  backend: DirectBufferBackend = nativeScriptBackend,
): JavaByteBufferLike {
  // A zero-capacity direct buffer may have no address to view.
  const javaBuffer = backend.allocateDirect(Math.max(bytes.length, 1));
  backend.viewOf(javaBuffer).set(bytes);
  javaBuffer.limit(bytes.length);
  return javaBuffer;
}

let byteScratch: JavaDirectBuffer | null = null;

/** Java byte[] → Uint8Array in bulk (audio packets, sensor reports): one scratch buffer per isolate. */
export function javaBytesToUint8Array(javaBytes: any): Uint8Array {
  byteScratch ??= new JavaDirectBuffer(4096);
  return byteScratch.copyFromJava(javaBytes);
}

/** Uint8Array → Java byte[] in bulk, e.g. for WebSocket.sendBinary. */
export function uint8ArrayToJavaBytes(bytes: Uint8Array): any {
  byteScratch ??= new JavaDirectBuffer(4096);
  return byteScratch.copyToJavaArray(bytes);
}
