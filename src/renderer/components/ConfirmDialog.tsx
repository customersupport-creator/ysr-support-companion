interface ConfirmDialogProps {
  text: string;
  sending: boolean;
  onCancel: () => void;
  onSend: () => void;
}

export function ConfirmDialog({ text, sending, onCancel, onSend }: ConfirmDialogProps) {
  return (
    <div className="scrim" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">Send this exact text?</h2>
        <p className="dialog-lead">This is the message that will go out. Nothing sends until you confirm.</p>
        <pre className="exact">{text}</pre>
        <p className="len">{text.length} characters</p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel} disabled={sending}>
            Back
          </button>
          <button type="button" className="send" onClick={onSend} disabled={sending}>
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
