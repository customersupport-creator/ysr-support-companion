/** RingCentral support line for Yourspotrented.com. */
export const SUPPORT_LINE_E164 = "+13129995161";
export const SUPPORT_LINE_DISPLAY = "(312) 999-5161";

/** Registered loopback redirect for the desktop OAuth login. */
export const OAUTH_REDIRECT_URI = "http://127.0.0.1:47821/callback";
export const OAUTH_PORT = 47821;

/** Message-store is a RingCentral "Light" group, about 50 requests/minute. */
export const MESSAGE_STORE_LIMIT_PER_MIN = 40;
export const GENERAL_LIMIT_PER_MIN = 40;

export const RECONCILE_INTERVAL_MS = 60_000;
export const SOP_REFRESH_INTERVAL_MS = 10 * 60_000;
export const ACCESS_REFRESH_INTERVAL_MS = 30 * 60_000;
export const ALERT_TICK_MS = 15_000;
export const HISTORY_LOOKBACK_MS = 365 * 24 * 60 * 60 * 1000;

/** One toast per number, and only after the customer has been waiting this long. */
export const ALERT_AFTER_MS = 5 * 60_000;

export const AIRTABLE = {
  qaBaseId: "app4Vn8uT6XtMn89X",
  sopsTableId: "tblgmRifZVfzRxUmR",
  messagesTableId: "tblS6oOji4vK0YCky",
  qaTableId: "tblRQ8J78nxmAbExM",
  facilityBaseId: "app9iYUN8J3z2wjXN",
  facilityTableId: "tblmun9KBYW4aYBe1",
  monthlyTableId: "tblhJsSqzXe3LFopr",
  leaseTableId: "tblI0tuTqt43sfPH2",
  transientTableId: "tblPoNX9E3WSnsLyc",
} as const;

export const RC_SERVERS = {
  production: "https://platform.ringcentral.com",
  sandbox: "https://platform.devtest.ringcentral.com",
} as const;

export const PANEL_IDS = ["queue", "followups", "commitments", "alerts", "thread", "facilities", "settings"] as const;
export type PanelId = (typeof PANEL_IDS)[number];
