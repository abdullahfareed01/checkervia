// D110: every moderation action goes through this dialog. It names the
// action and its target, asks for the reason (kept in the audit log with
// the change), shows the action's own fields, and sends one guarded write.
// The native <dialog> keeps focus inside and closes on Escape.
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { problemText } from "../api";
import type { ActionResult } from "../moderation";
import { REASON_MIN } from "../moderation";
import { REASON_MAX } from "../protocol";
import { adminCall } from "../session";

export interface ActionRequest {
  readonly title: string; // "Suspend Player_07"
  readonly explain: string; // what happens, and whether it can be undone
  readonly op: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly submit: string; // the button's words
  readonly danger?: boolean;
  /** Extra fields; their values join the params when sent, except names starting with "_" (page only checks). */
  readonly fields?: (values: Record<string, unknown>, set: (name: string, value: unknown) => void) => ReactNode;
  readonly initial?: Readonly<Record<string, unknown>>;
  /** Extra checks before sending (for example, the typed username before a delete). */
  readonly ready?: (values: Record<string, unknown>) => boolean;
}

export function ActionDialog({ request, onClose, onDone }: { request: ActionRequest; onClose: () => void; onDone: (message: string) => void }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({ ...request.initial });
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
    return () => node?.close();
  }, []);
  const trimmed = reason.trim();
  const canSend = trimmed.length >= REASON_MIN && (request.ready?.(values) ?? true) && !sending;
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    setSending(true); setProblem("");
    const sent = Object.fromEntries(Object.entries(values).filter(([name]) => !name.startsWith("_")));
    const answer = await adminCall<ActionResult>(request.op, { ...request.params, ...sent, reason: trimmed });
    setSending(false);
    if (answer.kind === "ok") onDone(answer.value.message);
    else setProblem(problemText(answer));
  }
  return <dialog ref={dialog} className="adm-dialog" aria-labelledby={`${id}-title`} onCancel={(event) => { event.preventDefault(); if (!sending) onClose(); }}>
    <form className="adm-form" onSubmit={(event) => void send(event)}>
      <h2 id={`${id}-title`} className="adm-panel-title">{request.title}</h2>
      <p className="adm-dim adm-small">{request.explain}</p>
      {request.fields?.(values, (name, value) => setValues((before) => ({ ...before, [name]: value })))}
      <label className="adm-field">Reason (kept in the audit log)
        <textarea name="reason" rows={3} required minLength={REASON_MIN} maxLength={REASON_MAX} value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      <p className="adm-problem" role="alert">{problem}</p>
      <div className="adm-filter-actions adm-dialog-actions">
        <button type="button" className="adm-button adm-button-quiet" disabled={sending} onClick={onClose}>Cancel</button>
        <button type="submit" className={`adm-button ${request.danger ? "adm-button-danger" : "adm-button-primary"}`} disabled={!canSend}>{sending ? "Saving" : request.submit}</button>
      </div>
    </form>
  </dialog>;
}

/** One dialog at a time, and a notice line for what the last action did. */
export function useActions(onChanged: () => void) {
  const [request, setRequest] = useState<ActionRequest | null>(null);
  const [notice, setNotice] = useState("");
  const dialog = request ? <ActionDialog key={request.title + request.op} request={request} onClose={() => setRequest(null)}
    onDone={(message) => { setRequest(null); setNotice(message); onChanged(); }} /> : null;
  const noticeLine = <p className={notice ? "adm-notice" : "adm-sr"} role="status">{notice}</p>;
  return { open: (next: ActionRequest) => { setNotice(""); setRequest(next); }, dialog, notice: noticeLine };
}
