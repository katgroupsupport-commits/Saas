import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Dashboard, GroupSelectionPage, HubGridPage } from "../pages/dashboard";
import { GuidePage } from "../pages/auth";
import { roles } from "../services/permissions";
import MemberPortalRoutes from "./MemberPortalRoutes";
import OperationsRoutes from "./OperationsRoutes";
import SetupRoutes from "./SetupRoutes";
import ShellRoutes from "./ShellRoutes";

export default function AppRoutes({
  role,
  state,
  viewState,
  visibleViewState,
  selectedGroup,
  selectedGroupId,
  patchState,
  setSelectedGroupId,
  setConfirmDialog,
  setNotification,
  migrationLoading,
  setMigrationLoading,
  ensureLatestTenantData,
  signOut,
  pageComponents,
  memberPortalActive,
  visibleHomeHubButtons,
  visibleTransactionsHubButtons,
  visibleSetupHubButtons,
  visibleMoreHubButtons
}) {
  const {
    Members,
    SetupPage,
    Subscriptions,
    Periods,
    Transactions,
    Withdrawals,
    PendingDues,
    FinanceAgent,
    Corrections,
    Adjustments,
    Reversals,
    Waivers,
    ProductOwnerSupport,
    Loans,
    Approvals,
    Reports,
    ContactSupport,
    MemberSavings,
    MemberLoans,
    MemberNotifications,
    MemberProfile,
    DashboardPage,
    SettingsPage
  } = pageComponents;

  const dashboardComponent = DashboardPage || Dashboard;

  return (
    <Routes>
      {ShellRoutes({
        role,
        state,
        viewState,
        visibleViewState,
        selectedGroup,
        selectedGroupId,
        patchState,
        setSelectedGroupId,
        setConfirmDialog,
        setNotification,
        dashboardComponent,
        visibleHomeHubButtons,
        visibleTransactionsHubButtons,
        visibleSetupHubButtons,
        visibleMoreHubButtons
      })}
      {MemberPortalRoutes({
        role,
        state,
        viewState,
        visibleViewState,
        patchState,
        setConfirmDialog,
        setNotification,
        signOut,
        pageComponents,
        dashboardComponent
      })}
      {SetupRoutes({
        role,
        state,
        viewState,
        selectedGroup,
        patchState,
        setConfirmDialog,
        setNotification,
        migrationLoading,
        setMigrationLoading,
        ensureLatestTenantData,
        pageComponents
      })}
      {OperationsRoutes({
        role,
        state,
        viewState,
        visibleViewState,
        selectedGroup,
        selectedGroupId,
        patchState,
        setSelectedGroupId,
        setConfirmDialog,
        setNotification,
        migrationLoading,
        setMigrationLoading,
        ensureLatestTenantData,
        pageComponents
      })}
    </Routes>
  );
}
