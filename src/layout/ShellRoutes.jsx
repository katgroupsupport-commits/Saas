import React from "react";
import { Navigate, Route } from "react-router-dom";
import { Dashboard, GroupSelectionPage, HubGridPage } from "../pages/dashboard";
import { GuidePage } from "../pages/auth";
import { roles } from "../services/permissions";

export default function ShellRoutes({
  role,
  state,
  viewState,
  visibleViewState,
  selectedGroupId,
  patchState,
  setSelectedGroupId,
  setConfirmDialog,
  setNotification,
  dashboardComponent: DashboardComponent,
  visibleHomeHubButtons,
  visibleTransactionsHubButtons,
  visibleSetupHubButtons,
  visibleMoreHubButtons
}) {
  return (
    <>
      <Route
        path="/select-group"
        element={
          <GroupSelectionPage
            state={state}
            setState={patchState}
            selectedGroupId={selectedGroupId}
            setSelectedGroupId={setSelectedGroupId}
            actor={state.session.user}
            setConfirmDialog={setConfirmDialog}
            setNotification={setNotification}
          />
        }
      />
      <Route path="/" element={<Navigate replace to="/home" />} />
      <Route path="/home" element={<HubGridPage title="Home" items={visibleHomeHubButtons} />} />
      <Route path="/transactions-hub" element={<HubGridPage title="Transactions" items={visibleTransactionsHubButtons} />} />
      <Route
        path="/setup-hub"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <HubGridPage title="Setup" items={visibleSetupHubButtons} />
          )
        }
      />
      <Route path="/more" element={<HubGridPage title="More" items={visibleMoreHubButtons} />} />
      <Route path="/guide" element={<GuidePage insideApp />} />
      <Route
        path="*"
        element={
          <DashboardComponent
            role={role}
            state={viewState}
            actor={state.session.user}
            setConfirmDialog={setConfirmDialog}
            setNotification={setNotification}
          />
        }
      />
    </>
  );
}
