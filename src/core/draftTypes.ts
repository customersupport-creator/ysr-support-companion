import type {
  DraftBundle,
  FacilityRecord,
  ReservationInfo,
  SopRecord,
  Thread,
} from "../shared/types";

export interface DraftEdit {
  changes: string;
  previousText: string;
  previous: DraftBundle;
}

export interface DraftInput {
  thread: Thread;
  latestCustomerMessageId: string;
  sops: SopRecord[];
  facility: FacilityRecord | null;
  reservation: ReservationInfo | null;
  correctionSummary: string;
  agentName: string;
  signature: string;
  nowIso: string;
  edit?: DraftEdit;
}

export interface Drafter {
  draft(input: DraftInput): Promise<DraftBundle>;
}
