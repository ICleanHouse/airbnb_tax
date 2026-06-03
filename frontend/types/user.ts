export type AccountStatus = "pending" | "approved" | "rejected" | "suspended";

export type UserRole = "host" | "cleaner" | "agency" | "admin";

export interface CurrentUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  preferred_language: "bg" | "en";
  role: UserRole;
  account_status: AccountStatus;
  is_approved: boolean;
  is_platform_admin: boolean;
}
