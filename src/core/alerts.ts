import { ALERT_AFTER_MS } from "../shared/constants";

/** A waiting number is alerted once, and only after five minutes with no reply. */
export function shouldAlertForWait(waitMs: number): boolean {
  return waitMs >= ALERT_AFTER_MS;
}

export { ALERT_AFTER_MS };
