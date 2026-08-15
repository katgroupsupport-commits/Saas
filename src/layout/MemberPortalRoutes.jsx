import React from "react";
import { Route } from "react-router-dom";
import { roles } from "../services/permissions";

export default function MemberPortalRoutes({
  role,
  state,
  viewState,
  visibleViewState,
  patchState,
  setConfirmDialog,
  setNotification,
  signOut,
  pageComponents,
  dashboardComponent: DashboardComponent
}) {
  const {
    MemberSavings,
    MemberLoans,
    MemberNotifications,
    MemberProfile
  } = pageComponents;

  return (
    <>
      <Route
        path="/dashboard/group"
        element={
          <DashboardComponent
            role={role}
            state={visibleViewState}
            actor={{ ...state.session.user, role }}
            forceGroupView
            setConfirmDialog={setConfirmDialog}
            setNotification={setNotification}
          />
        }
      />
      <Route
        path="/dashboard/member"
        element={
          <DashboardComponent
            role={role}
            state={visibleViewState}
            actor={{ ...state.session.user, role }}
            memberPortal
            setConfirmDialog={setConfirmDialog}
            setNotification={setNotification}
          />
        }
      />
      <Route
        path="/group-dashboard"
        element={
          <DashboardComponent
            role={role}
            state={visibleViewState}
            actor={{ ...state.session.user, role }}
            forceGroupView
            setConfirmDialog={setConfirmDialog}
            setNotification={setNotification}
          />
        }
      />
      <Route
        path="/my-savings"
        element={
          <MemberSavings
            state={visibleViewState}
            actor={{ ...state.session.user, role }}
            setConfirmDialog={setConfirmDialog}
            setNotification={setNotification}
          />
        }
      />
      <Route
        path="/my-loans"
        element={
          <MemberLoans
            state={visibleViewState}
            actor={{ ...state.session.user, role }}
            setConfirmDialog={setConfirmDialog}
            setNotification={setNotification}
          />
        }
      />
      <Route
        path="/notifications"
        element={
          <MemberNotifications
            state={visibleViewState}
            actor={{ ...state.session.user, role }}
            setState={patchState}
            setConfirmDialog={setConfirmDialog}
            setNotification={setNotification}
          />
        }
      />
      <Route
        path="/profile"
        element={
          <MemberProfile
            state={viewState}
            setState={patchState}
            actor={state.session.user}
            setConfirmDialog={setConfirmDialog}
            setNotification={setNotification}
            signOut={signOut}
          />
        }
      />
    </>
  );
}
