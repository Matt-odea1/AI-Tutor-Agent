/**
 * draftStore — durable, framework-agnostic persistence for an in-progress answer
 * so a page refresh, browser crash, or React error-boundary reload can't silently
 * lose an unsubmitted recording or typed answer on this forward-only flow.
 *
 * Two backing stores, chosen per payload:
 *  - AUDIO blob  → IndexedDB (object store `drafts`). IndexedDB stores Blob values
 *    natively and survives a reload; sessionStorage cannot hold a Blob.
 *  - TEXT draft  → sessionStorage (small, synchronous), mirroring the existing
 *    `consent_*` / `started_*` / `qtimer_start_*` sessionStorage patterns.
 *
 * Keys live in the `draft_*` namespace that the P4 timer work explicitly reserves
 * for this task (its own anchors use `qtimer_start_*`), so the two never collide.
 *
 * NO new npm dependency: this uses the raw browser `indexedDB` API, not `idb`.
 *
 * Every operation is wrapped in try/catch and degrades to a no-op / `null` when
 * persistence is unavailable or throws (private-mode Safari, quota exhaustion,
 * jsdom with no IndexedDB). Losing a draft is acceptable; breaking the recording
 * happy path because persistence failed is not — so nothing here ever rejects.
 */

const DB_NAME = 'oral-assessment';
const DB_VERSION = 1;
const AUDIO_STORE = 'drafts';

/** Persisted audio-draft record shape (keyPath = assessmentId). */
interface AudioDraftRecord {
  assessmentId: string;
  questionId: string;
  blob: Blob;
  durationSeconds: number;
}

export interface AudioDraft {
  questionId: string;
  blob: Blob;
  durationSeconds: number;
}

export interface TextDraft {
  questionId: string;
  text: string;
}

/** sessionStorage key for the text draft of a given assessment. */
function textKey(assessmentId: string): string {
  return `draft_text_${assessmentId}`;
}

/**
 * Return the IndexedDB factory if usable, else null. Accessing `indexedDB` can
 * itself throw a SecurityError in some sandboxed/private contexts, so the read is
 * guarded too.
 */
function getIndexedDB(): IDBFactory | null {
  try {
    if (typeof indexedDB !== 'undefined' && indexedDB) return indexedDB;
  } catch {
    /* accessing indexedDB threw (sandboxed/blocked) — fall through to null */
  }
  return null;
}

/**
 * Open (creating/upgrading as needed) the drafts DB. Resolves to null — never
 * rejects — when IndexedDB is unavailable or the open fails, so every caller can
 * treat "no DB" and "DB error" identically as a graceful no-op.
 */
function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    const idb = getIndexedDB();
    if (!idb) {
      resolve(null);
      return;
    }
    try {
      const request = idb.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(AUDIO_STORE)) {
          db.createObjectStore(AUDIO_STORE, { keyPath: 'assessmentId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.warn('[draftStore] failed to open IndexedDB:', request.error);
        resolve(null);
      };
      request.onblocked = () => resolve(null);
    } catch (error) {
      console.warn('[draftStore] indexedDB.open threw:', error);
      resolve(null);
    }
  });
}

// ─── Audio draft (IndexedDB) ───────────────────────────────────────────────

/**
 * Persist the recorded audio blob (plus its question id + duration) for an
 * assessment. One in-flight answer at a time matches the forward-only flow, so
 * the record is keyed by assessmentId; questionId is stored inside so rehydrate
 * can confirm the draft still matches the current question. Never throws.
 */
export async function saveAudioDraft(args: {
  assessmentId: string;
  questionId: string;
  blob: Blob;
  durationSeconds: number;
}): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(AUDIO_STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        console.warn('[draftStore] saveAudioDraft tx error:', tx.error);
        resolve();
      };
      tx.onabort = () => resolve();
      const record: AudioDraftRecord = {
        assessmentId: args.assessmentId,
        questionId: args.questionId,
        blob: args.blob,
        durationSeconds: args.durationSeconds,
      };
      tx.objectStore(AUDIO_STORE).put(record);
    });
    db.close();
  } catch (error) {
    console.warn('[draftStore] saveAudioDraft failed (non-fatal):', error);
  }
}

/**
 * Load the persisted audio draft for an assessment, or null when none exists /
 * the value is unreadable / IndexedDB is unavailable. Never throws.
 */
export async function loadAudioDraft(assessmentId: string): Promise<AudioDraft | null> {
  try {
    const db = await openDb();
    if (!db) return null;
    const record = await new Promise<AudioDraftRecord | null>((resolve) => {
      const tx = db.transaction(AUDIO_STORE, 'readonly');
      const request = tx.objectStore(AUDIO_STORE).get(assessmentId);
      request.onsuccess = () => resolve((request.result as AudioDraftRecord) ?? null);
      request.onerror = () => resolve(null);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    });
    db.close();
    if (
      record &&
      typeof record.questionId === 'string' &&
      record.blob instanceof Blob &&
      typeof record.durationSeconds === 'number'
    ) {
      return { questionId: record.questionId, blob: record.blob, durationSeconds: record.durationSeconds };
    }
    return null;
  } catch (error) {
    console.warn('[draftStore] loadAudioDraft failed (non-fatal):', error);
    return null;
  }
}

/** Delete the persisted audio draft for an assessment. Never throws. */
export async function clearAudioDraft(assessmentId: string): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(AUDIO_STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
      tx.objectStore(AUDIO_STORE).delete(assessmentId);
    });
    db.close();
  } catch (error) {
    console.warn('[draftStore] clearAudioDraft failed (non-fatal):', error);
  }
}

// ─── Text draft (sessionStorage) ────────────────────────────────────────────

/**
 * Persist the typed answer (with its question id) for an assessment. Stored as
 * JSON so the question id travels with the text and rehydrate can reject a stale
 * draft. Synchronous; never throws.
 */
export function saveTextDraft(assessmentId: string, questionId: string, text: string): void {
  try {
    const payload: TextDraft = { questionId, text };
    sessionStorage.setItem(textKey(assessmentId), JSON.stringify(payload));
  } catch {
    /* storage disabled / over quota — drafts simply won't survive refresh */
  }
}

/**
 * Load the typed-answer draft for an assessment, or null when absent / malformed
 * / storage unavailable. Never throws.
 */
export function loadTextDraft(assessmentId: string): TextDraft | null {
  try {
    const raw = sessionStorage.getItem(textKey(assessmentId));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as TextDraft).questionId === 'string' &&
      typeof (parsed as TextDraft).text === 'string'
    ) {
      return parsed as TextDraft;
    }
    return null;
  } catch {
    return null;
  }
}

/** Delete the typed-answer draft for an assessment. Never throws. */
export function clearTextDraft(assessmentId: string): void {
  try {
    sessionStorage.removeItem(textKey(assessmentId));
  } catch {
    /* storage disabled — nothing to clear */
  }
}
