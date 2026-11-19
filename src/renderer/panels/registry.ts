import type { PanelId } from "../../shared/constants";

/** Add a panel here, then render it from App. No other shell changes are required. */
export interface DeskPanel {
  id: PanelId;
  label: string;
  count?: "queue" | "followups" | "commitments" | "alerts";
}

export const deskPanels: DeskPanel[] = [
  { id: "queue", label: "Queue", count: "queue" },
  { id: "followups", label: "Follow-ups", count: "followups" },
  { id: "commitments", label: "Promises", count: "commitments" },
  { id: "alerts", label: "Facility alerts", count: "alerts" },
  { id: "thread", label: "Thread" },
  { id: "facilities", label: "Facilities" },
  { id: "settings", label: "Settings" },
];
