export type AccountStatus = "pending" | "approved" | "rejected" | "suspended";

export type UserRole = "host" | "cleaner" | "agency" | "admin";

/** Per-user UI preferences synced to the account (see User.dashboard_prefs). */
export interface DashboardPrefs {
  /** Applications summary cards: ordered list of visible card keys. */
  applications?: { cards?: string[] };
  [key: string]: unknown;
}

export interface CurrentUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  preferred_language: "bg" | "en";
  dashboard_prefs?: DashboardPrefs;
  role: UserRole;
  account_status: AccountStatus;
  is_approved: boolean;
  is_platform_admin: boolean;
}
