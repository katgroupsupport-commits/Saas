import React from "react";
import { Navigate, Route } from "react-router-dom";
import { roles } from "../services/permissions";

export default function SetupRoutes({
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
}) {
  const {
    Members,
    SetupPage,
    Subscriptions,
    Periods
  } = pageComponents;

  return (
    <>
      <Route
        path="/members"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <Members
              state={viewState}
              setState={patchState}
              actor={state.session.user}
              setConfirmDialog={setConfirmDialog}
              setNotification={setNotification}
            />
          )
        }
      />
      <Route
        path="/setup"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <SetupPage
              state={viewState}
              setState={patchState}
              actor={state.session.user}
              selectedGroup={selectedGroup}
              setConfirmDialog={setConfirmDialog}
              setNotification={setNotification}
              migrationLoading={migrationLoading}
              setMigrationLoading={setMigrationLoading}
              ensureLatestTenantData={ensureLatestTenantData}
            />
          )
        }
      />
      <Route
        path="/subscriptions"
        element={
          <Subscriptions
            state={viewState}
            setState={patchState}
            actor={state.session.user}
            selectedGroup={selectedGroup}
            setConfirmDialog={setConfirmDialog}
            setNotification={setNotification}
          />
        }
      />
      <Route
        path="/periods"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <Periods
              state={viewState}
              setState={patchState}
              actor={state.session.user}
              setConfirmDialog={setConfirmDialog}
              setNotification={setNotification}
            />
          )
        }
      />
      <Route
        path="/setup/group"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <SetupPage
              state={viewState}
              setState={patchState}
              actor={state.session.user}
              selectedGroup={selectedGroup}
              initialSetupTab="group"
              setConfirmDialog={setConfirmDialog}
              setNotification={setNotification}
              migrationLoading={migrationLoading}
              setMigrationLoading={setMigrationLoading}
              ensureLatestTenantData={ensureLatestTenantData}
            />
          )
        }
      />
      <Route
        path="/setup/member"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <SetupPage
              state={viewState}
              setState={patchState}
              actor={state.session.user}
              selectedGroup={selectedGroup}
              initialSetupTab="member"
              setConfirmDialog={setConfirmDialog}
              setNotification={setNotification}
              migrationLoading={migrationLoading}
              setMigrationLoading={setMigrationLoading}
              ensureLatestTenantData={ensureLatestTenantData}
            />
          )
        }
      />
      <Route
        path="/setup/financial"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <SetupPage
              state={viewState}
              setState={patchState}
              actor={state.session.user}
              selectedGroup={selectedGroup}
              initialSetupTab="financial"
              initialFinancialTab="roles"
              setConfirmDialog={setConfirmDialog}
              setNotification={setNotification}
              migrationLoading={migrationLoading}
              setMigrationLoading={setMigrationLoading}
              ensureLatestTenantData={ensureLatestTenantData}
            />
          )
        }
      />
      <Route
        path="/setup/approval"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <Navigate replace to="/setup/roles" />
          )
        }
      />
      <Route
        path="/setup/loan"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <SetupPage
              state={viewState}
              setState={patchState}
              actor={state.session.user}
              selectedGroup={selectedGroup}
              initialSetupTab="financial"
              initialFinancialTab="loan"
              setConfirmDialog={setConfirmDialog}
              setNotification={setNotification}
              migrationLoading={migrationLoading}
              setMigrationLoading={setMigrationLoading}
              ensureLatestTenantData={ensureLatestTenantData}
            />
          )
        }
      />
      <Route
        path="/setup/periods"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <SetupPage
              state={viewState}
              setState={patchState}
              actor={state.session.user}
              selectedGroup={selectedGroup}
              initialSetupTab="financial"
              initialFinancialTab="period"
              setConfirmDialog={setConfirmDialog}
              setNotification={setNotification}
              migrationLoading={migrationLoading}
              setMigrationLoading={setMigrationLoading}
              ensureLatestTenantData={ensureLatestTenantData}
            />
          )
        }
      />
      <Route
        path="/setup/roles"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <SetupPage
              state={viewState}
              setState={patchState}
              actor={state.session.user}
              selectedGroup={selectedGroup}
              initialSetupTab="financial"
              initialFinancialTab="roles"
              setConfirmDialog={setConfirmDialog}
              setNotification={setNotification}
              migrationLoading={migrationLoading}
              setMigrationLoading={setMigrationLoading}
              ensureLatestTenantData={ensureLatestTenantData}
            />
          )
        }
      />
      <Route
        path="/setup/calculator"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <SetupPage
              state={viewState}
              setState={patchState}
              actor={state.session.user}
              selectedGroup={selectedGroup}
              initialSetupTab="financial"
              initialFinancialTab="calculator"
              setConfirmDialog={setConfirmDialog}
              setNotification={setNotification}
              migrationLoading={migrationLoading}
              setMigrationLoading={setMigrationLoading}
              ensureLatestTenantData={ensureLatestTenantData}
            />
          )
        }
      />
      <Route
        path="/setup/legacy"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <SetupPage
              state={viewState}
              setState={patchState}
              actor={state.session.user}
              selectedGroup={selectedGroup}
              initialSetupTab="financial"
              initialFinancialTab="calculator"
              setConfirmDialog={setConfirmDialog}
              setNotification={setNotification}
              migrationLoading={migrationLoading}
              setMigrationLoading={setMigrationLoading}
              ensureLatestTenantData={ensureLatestTenantData}
            />
          )
        }
      />
    </>
  );
}
