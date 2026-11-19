import type { ApprovalOptionId, ApprovalState } from "../shared/types";

/**
 * Nothing is sent unless status is "approved" and the text is character-for-character
 * the approved text. Edits clear approvedText. MINE stores the agent's text but does
 * not approve it. Consent-blocked threads cannot be approved or sent.
 */
export class ApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalError";
  }
}

export function initialApproval(): ApprovalState {
  return {
    status: "idle",
    approvedText: null,
    candidateText: null,
    optionId: null,
    basedOnMessageId: null,
    skippedAtMessageId: null,
    notice: "",
  };
}

export function canDraft(state: ApprovalState, latestCustomerMessageId: string | null): boolean {
  if (!latestCustomerMessageId) return false;
  if (state.status === "consent_blocked") return false;
  if (state.status === "skipped" && state.skippedAtMessageId === latestCustomerMessageId) return false;
  return true;
}

export function blockForConsent(state: ApprovalState): ApprovalState {
  return {
    ...initialApproval(),
    status: "consent_blocked",
    basedOnMessageId: state.basedOnMessageId,
    notice: "Consent warning. Drafting and sending are blocked.",
  };
}

export function presentDraft(state: ApprovalState, messageId: string): ApprovalState {
  if (state.status === "consent_blocked") return state;
  if (state.status === "skipped" && state.skippedAtMessageId === messageId) return state;
  return {
    status: "draft_ready",
    approvedText: null,
    candidateText: null,
    optionId: null,
    basedOnMessageId: messageId,
    skippedAtMessageId: null,
    notice:
      state.status === "invalidated" && state.notice
        ? state.notice
        : "Draft ready. Nothing is sent until you APPROVE the exact text.",
  };
}

export function approveExact(
  state: ApprovalState,
  text: string,
  optionId: ApprovalOptionId,
): ApprovalState {
  if (state.status === "consent_blocked") {
    throw new ApprovalError("Consent warning: drafting and sending are blocked for this contact.");
  }
  if (state.status === "skipped") {
    throw new ApprovalError("Drafting is skipped until the customer sends a new message.");
  }
  if (text.length === 0) {
    throw new ApprovalError("Cannot approve an empty message.");
  }
  return {
    ...state,
    status: "approved",
    approvedText: text,
    candidateText: text,
    optionId,
    notice: `Approved option ${optionId}. Confirm to send this exact text.`,
  };
}

export function invalidate(state: ApprovalState, reason: string): ApprovalState {
  if (state.status === "consent_blocked") return state;
  return {
    ...state,
    status: "invalidated",
    approvedText: null,
    candidateText: null,
    optionId: null,
    notice: reason,
  };
}

export function logMine(state: ApprovalState, text: string): ApprovalState {
  if (state.status === "consent_blocked") {
    throw new ApprovalError("Consent warning: drafting and sending are blocked for this contact.");
  }
  if (state.status === "skipped") {
    throw new ApprovalError("Drafting is skipped until the customer sends a new message.");
  }
  if (text.length === 0) {
    throw new ApprovalError("MINE needs the text you want to send.");
  }
  return {
    ...state,
    status: "mine_logged",
    approvedText: null,
    candidateText: text,
    optionId: "MINE",
    notice: "Your text is logged unchanged. It is not approved and will not be sent until you APPROVE it.",
  };
}

export function rejectDraft(state: ApprovalState): ApprovalState {
  if (state.status === "consent_blocked") {
    throw new ApprovalError("Consent warning: drafting and sending are blocked for this contact.");
  }
  return {
    ...state,
    status: "rejected",
    approvedText: null,
    candidateText: null,
    optionId: null,
    notice: "Rejected. Draft new options if you want another pass.",
  };
}

export function skipThread(state: ApprovalState, messageId: string): ApprovalState {
  if (state.status === "consent_blocked") return state;
  return {
    ...initialApproval(),
    status: "skipped",
    basedOnMessageId: messageId,
    skippedAtMessageId: messageId,
    notice: "Skipped. Drafting stays off until this customer sends a new message.",
  };
}

export function noteCustomerMessage(state: ApprovalState, messageId: string): ApprovalState {
  if (state.status === "consent_blocked") return state;
  if (state.status === "skipped") {
    if (state.skippedAtMessageId === messageId) return state;
    return {
      ...initialApproval(),
      notice: "New customer message. Drafting again.",
    };
  }
  if (state.basedOnMessageId && state.basedOnMessageId !== messageId) {
    if (state.status === "approved" || state.status === "mine_logged" || state.status === "draft_ready") {
      return {
        ...initialApproval(),
        status: "invalidated",
        notice: "A new customer message arrived. The previous approval was cleared.",
      };
    }
  }
  return state;
}

export function markSent(state: ApprovalState): ApprovalState {
  return {
    ...state,
    status: "sent",
    notice: "Sent.",
  };
}

export function sendGuard(state: ApprovalState, text: string): void {
  if (state.status === "consent_blocked") {
    throw new ApprovalError("Consent warning: drafting and sending are blocked for this contact.");
  }
  if (state.status !== "approved" || state.approvedText == null) {
    throw new ApprovalError("Refusing to send. The exact text has not been approved.");
  }
  if (state.approvedText !== text) {
    throw new ApprovalError("Refusing to send. Approval does not match this exact text.");
  }
}
