"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Building2, LogOut, RefreshCcw } from "lucide-react";
import { useTranslations } from "next-intl";

import NotificationBell from "../../components/NotificationBell";
import { RecoveryActions } from "../../components/RecoveryActions";
import { apiFetch, CurrentUser } from "../../lib/api";

type Readiness = {
  marketplace_eligible: boolean;
  profile_complete: boolean;
  eligible_active_members_count: number;
  blockers: string[];
};
type AgencyProfile = {
  id: number;
  company_name: string;
  city: string;
  service_areas: string[];
  description: string;
  readiness: Readiness;
};
type Member = {
  id: number;
  cleaner: number;
  cleaner_name: string;
  cleaner_marketplace_eligible: boolean;
  status: "active" | "revoked";
};
type Invitation = {
  id: number;
  target_cleaner: number | null;
  target_cleaner_name: string;
  status: string;
  expires_at: string;
};
type PublicCleaner = { user_id: number; display_name: string; city: string; marketplace_eligible: boolean };
type Application = {
  id: number;
  job: number;
  status: string;
  origin: string;
  proposed_member: number | null;
};
type Assignment = {
  id: number;
  job: number;
  job_title?: string;
  job_status?: string;
  assigned_member?: number | null;
  assigned_member_name?: string;
  available_actions?: string[];
};
type Tab = "overview" | "profile" | "members" | "invitations" | "work" | "assignments" | "history";

function asList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && Array.isArray((data as { results?: unknown[] }).results)) {
    return (data as { results: T[] }).results;
  }
  return [];
}

export default function AgencyDashboard() {
  const t = useTranslations("agency");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [profile, setProfile] = useState<AgencyProfile | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [cleaners, setCleaners] = useState<PublicCleaner[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [memberChoice, setMemberChoice] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const meResponse = await apiFetch("/api/accounts/me/");
    if (!meResponse.ok) {
      setLoading(false);
      return;
    }
    const currentUser = await meResponse.json() as CurrentUser;
    if (currentUser.role !== "agency") {
      window.location.replace("/app");
      return;
    }
    setUser(currentUser);
    const agenciesResponse = await apiFetch("/api/accounts/agencies/");
    const agencies = agenciesResponse.ok ? asList<AgencyProfile>(await agenciesResponse.json()) : [];
    const ownProfile = agencies[0] ?? null;
    setProfile(ownProfile);
    const [membersResponse, invitationsResponse, cleanersResponse, applicationsResponse, assignmentsResponse] = await Promise.all([
      apiFetch("/api/accounts/agency-memberships/"),
      apiFetch("/api/accounts/agency-invitations/"),
      apiFetch("/api/accounts/public-cleaners/?city=sofia"),
      apiFetch("/api/marketplace/applications/"),
      apiFetch("/api/marketplace/assignments/"),
    ]);
    setMembers(membersResponse.ok ? asList<Member>(await membersResponse.json()) : []);
    setInvitations(invitationsResponse.ok ? asList<Invitation>(await invitationsResponse.json()) : []);
    setCleaners(cleanersResponse.ok ? asList<PublicCleaner>(await cleanersResponse.json()) : []);
    setApplications(applicationsResponse.ok ? asList<Application>(await applicationsResponse.json()) : []);
    setAssignments(assignmentsResponse.ok ? asList<Assignment>(await assignmentsResponse.json()) : []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const readiness = profile?.readiness ?? user?.agency_readiness ?? null;
  const activeMembers = useMemo(
    () => members.filter((member) => member.status === "active" && member.cleaner_marketplace_eligible),
    [members],
  );
  const availableCleaners = useMemo(
    () => cleaners.filter((cleaner) => cleaner.marketplace_eligible && !members.some((member) => member.cleaner === cleaner.user_id && member.status === "active")),
    [cleaners, members],
  );

  async function action(path: string, body?: object) {
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await apiFetch(path, { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { detail?: string };
        setError(data.detail || t("errors.action"));
        return false;
      }
      setNotice(t("notice.updated"));
      await load();
      return true;
    } finally { setSaving(false); }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const form = new FormData(event.currentTarget);
    const serviceAreas = String(form.get("service_areas") || "").split(",").map((area) => area.trim()).filter(Boolean);
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await apiFetch(`/api/accounts/agencies/${profile.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          company_name: String(form.get("company_name") || "").trim(),
          city: "Sofia",
          service_areas: serviceAreas,
          description: String(form.get("description") || "").trim(),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { detail?: string };
        setError(data.detail || t("errors.profile"));
        return;
      }
      setNotice(t("notice.profileSaved"));
      await load();
    } finally { setSaving(false); }
  }

  async function logout() {
    await apiFetch("/api/accounts/logout/", { method: "POST" });
    window.location.href = "/";
  }

  if (loading) return <main className="agency-page"><p className="agency-loading">{t("loading")}</p></main>;
  if (!user || !profile) return <main className="agency-page"><p className="agency-loading">{t("errors.unavailable")}</p></main>;

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "overview", label: t("tabs.overview") }, { id: "profile", label: t("tabs.profile") },
    { id: "members", label: t("tabs.members") }, { id: "invitations", label: t("tabs.invitations") },
    { id: "work", label: t("tabs.work") }, { id: "assignments", label: t("tabs.assignments") },
    { id: "history", label: t("tabs.history") },
  ];

  return <main className="agency-page">
    <header className="agency-header">
      <Link className="site-brand" href="/"><Building2 size={19} aria-hidden /><strong>{profile.company_name}</strong></Link>
      <div className="agency-header-actions"><NotificationBell /><button type="button" className="secondary-link" onClick={() => void load()}><RefreshCcw size={16} aria-hidden />{t("refresh")}</button><button type="button" className="secondary-link" onClick={() => void logout()}><LogOut size={16} aria-hidden />{t("logout")}</button></div>
    </header>
    <div className="agency-shell">
      <nav className="agency-tabs" aria-label={t("tabs.label")} role="tablist">
        {tabs.map((item) => <button key={item.id} role="tab" type="button" aria-selected={tab === item.id} className={tab === item.id ? "is-active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </nav>
      {notice ? <p className="agency-notice" aria-live="polite">{notice}</p> : null}
      {error ? <p className="form-error" aria-live="polite">{error}</p> : null}

      {tab === "overview" && <section className="agency-panel" role="tabpanel"><h1>{t("overview.title")}</h1><p>{readiness?.marketplace_eligible ? t("overview.ready") : t("overview.notReady")}</p><dl className="agency-readiness"><div><dt>{t("overview.profile")}</dt><dd>{readiness?.profile_complete ? t("yes") : t("no")}</dd></div><div><dt>{t("overview.eligibleMembers")}</dt><dd>{readiness?.eligible_active_members_count ?? 0}</dd></div></dl>{readiness && !readiness.marketplace_eligible ? <ul>{readiness.blockers.map((blocker) => <li key={blocker}>{t(`blockers.${blocker}` as Parameters<typeof t>[0])}</li>)}</ul> : null}</section>}

      {tab === "profile" && <section className="agency-panel" role="tabpanel"><h1>{t("profile.title")}</h1><form className="agency-form" onSubmit={(event) => void saveProfile(event)}><label>{t("profile.name")}<input required name="company_name" defaultValue={profile.company_name} /></label><label>{t("profile.city")}<input disabled value="Sofia" /></label><label>{t("profile.areas")}<input required name="service_areas" defaultValue={profile.service_areas.join(", ")} /></label><label>{t("profile.description")}<textarea maxLength={1500} name="description" defaultValue={profile.description} /></label><button className="primary-link" disabled={saving} type="submit">{t("profile.save")}</button></form></section>}

      {tab === "members" && <section className="agency-panel" role="tabpanel"><h1>{t("members.title")}</h1>{members.length === 0 ? <p>{t("members.empty")}</p> : <ul className="agency-list">{members.map((member) => <li key={member.id}><span>{member.cleaner_name || t("members.unnamed")}</span><small>{member.status === "active" && member.cleaner_marketplace_eligible ? t("members.eligible") : t("members.inactive")}</small>{member.status === "active" ? <button disabled={saving} type="button" onClick={() => void action(`/api/accounts/agency-memberships/${member.id}/revoke/`)}>{t("members.revoke")}</button> : null}</li>)}</ul>}</section>}

      {tab === "invitations" && <section className="agency-panel" role="tabpanel"><h1>{t("invitations.title")}</h1><p>{t("invitations.safeDirectory")}</p><div className="agency-cards">{availableCleaners.map((cleaner) => <article key={cleaner.user_id}><strong>{cleaner.display_name}</strong><span>{cleaner.city}</span><button disabled={saving} type="button" onClick={() => void action(`/api/accounts/agencies/${profile.id}/invite-cleaner/`, { cleaner_id: cleaner.user_id })}>{t("invitations.invite")}</button></article>)}</div><ul className="agency-list">{invitations.map((invitation) => <li key={invitation.id}><span>{invitation.target_cleaner_name || t("members.unnamed")}</span><small>{invitation.status}</small>{invitation.status === "pending" ? <button disabled={saving} type="button" onClick={() => void action(`/api/accounts/agency-invitations/${invitation.id}/revoke/`)}>{t("invitations.revoke")}</button> : <button disabled={saving} type="button" onClick={() => void action(`/api/accounts/agency-invitations/${invitation.id}/resend/`)}>{t("invitations.resend")}</button>}</li>)}</ul></section>}

      {tab === "work" && <section className="agency-panel" role="tabpanel"><h1>{t("work.title")}</h1>{!readiness?.marketplace_eligible ? <p>{t("work.gated")}</p> : <>{applications.length === 0 ? <p>{t("work.empty")}</p> : <ul className="agency-list">{applications.filter((application) => application.status === "pending").map((application) => <li key={application.id}><span>{t("work.application", { id: application.id, job: application.job })}</span><select aria-label={t("work.memberChoice")} value={memberChoice[application.id] || String(application.proposed_member || "")} onChange={(event) => setMemberChoice((choices) => ({ ...choices, [application.id]: event.target.value }))}><option value="">{t("work.chooseMember")}</option>{activeMembers.map((member) => <option key={member.id} value={member.cleaner}>{member.cleaner_name}</option>)}</select><button type="button" disabled={saving || !(memberChoice[application.id] || application.proposed_member)} onClick={() => void action(`/api/marketplace/applications/${application.id}/select-member/`, { member_id: Number(memberChoice[application.id] || application.proposed_member) })}>{t("work.select")}</button></li>)}</ul>}</>}</section>}

      {tab === "assignments" && <section className="agency-panel" role="tabpanel"><h1>{t("assignments.title")}</h1>{assignments.filter((item) => item.job_status !== "completed" && item.job_status !== "cancelled").map((assignment) => <article className="agency-assignment" key={assignment.id}><h2>{assignment.job_title || t("assignments.job", { id: assignment.job })}</h2><p>{assignment.assigned_member_name || t("assignments.noMember")}</p><RecoveryActions jobId={assignment.job} actions={assignment.available_actions} onComplete={() => void load()} /></article>)}</section>}

      {tab === "history" && <section className="agency-panel" role="tabpanel"><h1>{t("history.title")}</h1><ul className="agency-list">{assignments.filter((item) => item.job_status === "completed" || item.job_status === "cancelled").map((assignment) => <li key={assignment.id}><span>{assignment.job_title || t("assignments.job", { id: assignment.job })}</span><small>{assignment.job_status}</small></li>)}</ul></section>}
    </div>
  </main>;
}
