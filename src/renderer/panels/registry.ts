import type { PanelId } from "../../shared/constants";

/** Add a panel here, then render it from App. No other shell changes are required. */
export interface DeskPanel {
  id: PanelId;
  label: string;
  count?: "queue";
}

export const deskPanels: DeskPanel[] = [
  { id: "queue", label: "Queue", count: "queue" },
  { id: "thread", label: "Thread" },
  { id: "facilities", label: "Facilities" },
  { id: "settings", label: "Settings" },
];
