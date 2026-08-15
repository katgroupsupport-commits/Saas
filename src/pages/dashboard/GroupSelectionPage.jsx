import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { roles } from "../../services/permissions";
import { groupSchema, validate } from "../../services/validation";
import { repository } from "../../services/repository";
import {
  isUuid,
  getHiddenGroupIds,
  saveHiddenGroupIds,
  recalculateMemberSavingsFromEffectiveLedger,
  syncMemberSavingsCorrectionsToSupabase
} from "../../services/stateHelpers";
import { Page, Section, FormCard, Field } from "../../components";
import { audit } from "../../services/storage";

export default function GroupSelectionPage({ state, setState, selectedGroupId, setSelectedGroupId, actor, setConfirmDialog, setNotification }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [showCreateForm, setShowCreateForm] = useState(state.groups.length === 0);
  const [showHiddenGroups, setShowHiddenGroups] = useState(false);
  const [values, setValues] = useState({ name: "", primaryContact: "" });
  const [errors, setErrors] = useState({});
  const hiddenGroupIds = new Set(getHiddenGroupIds(actor));
  const visibleGroups = (state.groups || []).filter((group) => !hiddenGroupIds.has(String(group.id)));
  const hiddenGroups = (state.groups || []).filter((group) => hiddenGroupIds.has(String(group.id)));
  const [groupSearchQuery, setGroupSearchQuery] = useState("");
  const filteredVisibleGroups = visibleGroups.filter((group) => {
    const q = String(groupSearchQuery || "").toLowerCase();
    if (!q) return true;
    return [group.name, group.code].some((f) => String(f || "").toLowerCase().includes(q));
  });

  function setGroupHidden(groupId, hidden) {
    const nextHiddenIds = new Set(getHiddenGroupIds(actor));
    if (hidden) nextHiddenIds.add(String(groupId));
    else nextHiddenIds.delete(String(groupId));
    saveHiddenGroupIds(actor, Array.from(nextHiddenIds));
    setState((current) => ({
      ...current,
      session: {
        ...current.session,
        user: {
          ...current.session.user,
          hiddenGroupIds: Array.from(nextHiddenIds)
        }
      }
    }));
    setNotification({ type: "success", message: hidden ? "Group hidden from this list." : "Group unhidden." });
  }

  async function submit(event) {
    event.preventDefault();
    const result = validate(groupSchema, values);
    setErrors(result.errors);
    if (!result.data) return;
    if (!repository.isConfigured()) {
      setNotification({ type: "error", message: "Cloud sync is not configured. Enable secure storage to save groups." });
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    setConfirmDialog({
      title: "Save group",
      message: "Save group online? Confirm to commit.",
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const createdGroup = await repository.createGroup({
            group_name: result.data.name,
            name: result.data.name,
            code: `BG-${Date.now().toString().slice(-5)}`,
            type: "Saving Group",
            currency: "INR",
            interestType: "Reducing",
            financialYear: `2026-${(new Date().getFullYear() + 1).toString().slice(-2)}`,
            startMonth: new Date().getMonth() + 1,
            maximumLoanLimit: 0,
            loanMultiplier: 3,
            loanEligibilityRules: { monthlySaving: 0 },
            createdBy: isUuid(actor?.id) ? actor.id : undefined,
            createdDate: new Date().toISOString().slice(0, 10),
            subscriptionStatus: "Active"
          });

          const tenantData = await repository.listTenantData();
          const correctedTenantData = recalculateMemberSavingsFromEffectiveLedger(tenantData);
          const tenantMembers = correctedTenantData.members?.some((member) => String(member.groupId) === String(createdGroup.id))
            ? correctedTenantData.members
            : createdGroup.creatorMember
              ? [createdGroup.creatorMember, ...(correctedTenantData.members || [])]
              : correctedTenantData.members;
          setState(() => ({
            ...correctedTenantData,
            members: tenantMembers,
            session: { signedIn: true, user: correctedTenantData.session?.user ?? actor }
          }));
          syncMemberSavingsCorrectionsToSupabase(correctedTenantData).catch((err) => console.error("Sync failed:", err));

          setSelectedGroupId(createdGroup.id);
          setValues({ name: "", primaryContact: "" });
          setShowCreateForm(false);
          setNotification({ type: "success", message: "Group saved online." });
          setTimeout(() => setNotification(null), 3000);
          const nextPath = returnTo === '/select-group' || returnTo === '/login' ? '/home' : returnTo;
          navigate(nextPath, { replace: true });
        } catch (error) {
          console.error("Create group failed", error);
          setNotification({ type: "error", message: `Unable to save group online: ${error.message}` });
          setTimeout(() => setNotification(null), 5000);
        }
      },
      onCancel: () => {
        setConfirmDialog(null);
        setNotification({ type: "info", message: "Group not saved online." });
        setTimeout(() => setNotification(null), 3000);
      }
    });
  }

  const returnTo = location?.state?.from || (location.pathname !== '/select-group' ? location.pathname : '/home');

  function selectGroup(groupId) {
    setSelectedGroupId(groupId);
    const nextPath = returnTo === '/select-group' || returnTo === '/login' ? '/home' : returnTo;
    navigate(nextPath, { replace: true });
  }

  return (
    <section className="page">
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div>
            <h1>Select a group</h1>
            <p>Choose which Bachat Gat group you want to work with</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => navigate(-1)}>
            Back
          </button>
        </div>
      </div>

      <div className="button-row group-switch-actions">
        <button type="button" className="primary-button" onClick={() => setShowCreateForm((open) => !open)}>
          {showCreateForm ? "Close Group Form" : "Create New Group"}
        </button>
        <button type="button" className="secondary-button" onClick={() => setShowHiddenGroups((open) => !open)} disabled={hiddenGroups.length === 0}>
          {showHiddenGroups ? "Hide Hidden Groups" : `Hidden Groups (${hiddenGroups.length})`}
        </button>
      </div>

      {showCreateForm && (
        <FormCard title="Create new group" onSubmit={submit}>
          <Field label="Group name" value={values.name} onChange={(value) => setValues({ ...values, name: value })} error={errors.name} required />
          <Field label="Primary mobile or email" value={values.primaryContact} onChange={(value) => setValues({ ...values, primaryContact: value })} error={errors.primaryContact} />
        </FormCard>
      )}

      {state.groups.length === 0 ? (
        <Section title="No groups yet">
          <p className="section-note">
            Create your first Bachat Gat group to unlock members, periods, collections, loans, approvals, and reports.
          </p>
        </Section>
      ) : (
        <Section title="Your groups">
          <div style={{ marginBottom: 12 }}>
            <input placeholder="Search groups by name or code" value={groupSearchQuery} onChange={(e) => setGroupSearchQuery(e.target.value)} />
          </div>
          <div className="data-grid">
            {filteredVisibleGroups.map((group) => {
              const creator = group.creatorName
                || state.members.find((member) => String(member.groupId) === String(group.id) && member.memberRole === roles.GROUP_ADMIN)?.fullName
                || group.primaryContactName
                || "Not available";
              return (
                <article
                  className="entity-card"
                  key={group.id}
                  onClick={() => selectGroup(group.id)}
                  style={{ cursor: "pointer" }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      selectGroup(group.id);
                    }
                  }}
                >
                  <div>
                    <h3>{group.name}</h3>
                    <p>{group.code}</p>
                    <p className="section-note">Creator: {creator}</p>
                    <p className="section-note">Created: {new Date(group.createdDate).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}</p>
                  </div>
                  <div className="button-row">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setGroupHidden(group.id, true);
                      }}
                    >
                      Hide
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {visibleGroups.length === 0 && <p className="section-note">All groups are hidden. Open hidden groups below to unhide one.</p>}
        </Section>
      )}

      {showHiddenGroups && hiddenGroups.length > 0 && (
        <Section title="Hidden groups">
          <div className="data-grid">
            {hiddenGroups.map((group) => (
              <article className="entity-card" key={group.id}>
                <h3>{group.name}</h3>
                <p>{group.code}</p>
                <div className="button-row">
                  <button type="button" onClick={() => setGroupHidden(group.id, false)}>Unhide</button>
                </div>
              </article>
            ))}
          </div>
        </Section>
      )}
    </section>
  );
}
