// Ephemeral image originals never enter persistent chat storage. Reservations
// enforce limits while reads overlap; deleting/replacing a draft retires its reads.
export interface ChatAttachment {
  base64?: unknown; mediaType?: unknown; name?: unknown; previewUrl?: unknown;
  thumbUrl?: unknown; sizeBytes?: unknown;[key: string]: unknown;
}
interface Draft { attachments: ChatAttachment[]; reservations: Map<symbol, number>; }
export type AttachmentReservation = { key: string; draft: Draft; token: symbol; };
export class ChatAttachmentDrafts {
  private drafts = new Map<string, Draft>();
  private draft(key: string): Draft {
    let draft = this.drafts.get(key);
    if (!draft) { draft = { attachments: [], reservations: new Map() }; this.drafts.set(key, draft); }
    return draft;
  }
  get(key: string, create = true): ChatAttachment[] {
    return (create ? this.draft(key) : this.drafts.get(key))?.attachments || [];
  }
  delete(key: string): void { this.drafts.delete(key); }
  replace(key: string, attachments: ChatAttachment[]): void {
    this.drafts.set(key, { attachments, reservations: new Map() });
  }
  consume(key: string, submitted: Iterable<unknown> | null | undefined): void {
    const draft = this.drafts.get(key); if (!draft) return;
    const removed = new Set(submitted);
    // Preserve the draft's identity for reads started during the save.
    const retained = draft.attachments.filter(attachment => !removed.has(attachment));
    draft.attachments.splice(0, draft.attachments.length, ...retained);
  }
  reserve(key: string, bytes: number, limit: number, maxBytes: number): AttachmentReservation | 'count' | 'bytes' {
    const draft = this.draft(key);
    if (draft.attachments.length + draft.reservations.size >= limit) return 'count';
    const queued = draft.attachments.reduce((total, attachment) => total + attachmentBytes(attachment.sizeBytes), 0);
    const reading = [...draft.reservations.values()].reduce((total, size) => total + size, 0);
    if (!Number.isFinite(bytes) || bytes <= 0 || bytes + queued + reading > maxBytes) return 'bytes';
    const token = Symbol('image read'); draft.reservations.set(token, bytes);
    return { key, draft, token };
  }
  current(read: AttachmentReservation): boolean {
    return this.drafts.get(read.key) === read.draft && read.draft.reservations.has(read.token);
  }
  release(read: AttachmentReservation): void { read.draft.reservations.delete(read.token); }
  commit(read: AttachmentReservation, attachment: ChatAttachment, limit: number, maxBytes: number): boolean {
    if (!this.current(read)) return false;
    const { attachments } = read.draft;
    const bytes = attachments.reduce((total, item) => total + attachmentBytes(item.sizeBytes), 0);
    if (attachments.length >= limit || bytes + attachmentBytes(attachment.sizeBytes) > maxBytes) return false;
    attachments.push(attachment); this.release(read); return true;
  }
}
function attachmentBytes(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0; }
