import React from "react";
import { Navigate, Route } from "react-router-dom";
import { roles } from "../services/permissions";

export default function OperationsRoutes({
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
}) {
  const {
    Transactions,
    Withdrawals,
    PendingDues,
    FinanceAgent,
    Corrections,
    Adjustments,
    Reversals,
    Waivers,
    Loans,
    Approvals,
    Reports,
    ShareDistribution,
    ContactSupport,
    ProductOwnerSupport,
    SettingsPage
  } = pageComponents;

  return (
    <>
      <Route
        path="/transactions"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/transactions-hub" />
          ) : (
            <Transactions
              state={viewState}
              setState={patchState}
              actor={state.session.user}
              setSelectedGroupId={setSelectedGroupId}
              setConfirmDialog={setConfirmDialog}
              setNotification={setNotification}
            />
          )
        }
      />
      <Route
        path="/operations/transactions"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/transactions-hub" />
          ) : (
            <Transactions
              state={viewState}
              setState={patchState}
              actor={state.session.user}
              setSelectedGroupId={setSelectedGroupId}
              setConfirmDialog={setConfirmDialog}
              setNotification={setNotification}
            />
          )
        }
      />
      <Route
        path="/withdrawals"
        element={
          <Withdrawals
            state={visibleViewState}
            setState={patchState}
            actor={{ ...state.session.user, role }}
            setConfirmDialog={setConfirmDialog}
            setNotification={setNotification}
          />
        }
      />
      <Route
        path="/operations/withdrawals"
        element={
          <Withdrawals
            state={visibleViewState}
            setState={patchState}
            actor={{ ...state.session.user, role }}
            setConfirmDialog={setConfirmDialog}
            setNotification={setNotification}
          />
        }
      />
      <Route
        path="/pending-dues"
        element={
          <PendingDues
            state={visibleViewState}
            setState={patchState}
            actor={{ ...state.session.user, role }}
            setNotification={setNotification}
          />
        }
      />
      <Route
        path="/ai-agent"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <FinanceAgent
              state={visibleViewState}
              actor={{ ...state.session.user, role }}
              setNotification={setNotification}
            />
          )
        }
      />
      <Route
        path="/corrections"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <Corrections
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
        path="/corrections/adjustments"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <Adjustments
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
        path="/corrections/reversals"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <Reversals
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
        path="/corrections/waivers"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <Waivers
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
        path="/adjustments"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <Adjustments
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
        path="/reversals"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <Reversals
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
        path="/audit-history"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <Reports
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
        path="/loans"
        element={
          <Loans
            state={visibleViewState}
            setState={patchState}
            actor={{ ...state.session.user, role }}
            setConfirmDialog={setConfirmDialog}
            setNotification={setNotification}
          />
        }
      />
      <Route
        path="/operations/loans"
        element={
          <Loans
            state={visibleViewState}
            setState={patchState}
            actor={{ ...state.session.user, role }}
            setConfirmDialog={setConfirmDialog}
            setNotification={setNotification}
            ensureLatestTenantData={ensureLatestTenantData}
          />
        }
      />
      <Route
        path="/approvals"
        element={
          <Approvals
            state={viewState}
            setState={patchState}
            actor={state.session.user}
            setConfirmDialog={setConfirmDialog}
            setNotification={setNotification}
          />
        }
      />
      <Route
        path="/share-distribution"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <ShareDistribution
              state={viewState}
              actor={state.session.user}
              setNotification={setNotification}
            />
          )
        }
      />
      <Route
        path="/reports"
        element={
          <Reports
            state={viewState}
            actor={state.session.user}
            setConfirmDialog={setConfirmDialog}
            setNotification={setNotification}
          />
        }
      />
      <Route
        path="/contact-support"
        element={
          <ContactSupport
            state={viewState}
            setState={patchState}
            actor={state.session.user}
            setNotification={setNotification}
          />
        }
      />
      <Route
        path="/product-owner"
        element={
          role === roles.PRODUCT_OWNER ? (
            <ProductOwnerSupport
              state={state}
              setState={patchState}
              selectedGroupId={selectedGroupId}
              setSelectedGroupId={setSelectedGroupId}
              setNotification={setNotification}
            />
          ) : (
            <Navigate replace to="/home" />
          )
        }
      />
      <Route
        path="/settings"
        element={
          role === roles.MEMBER ? (
            <Navigate replace to="/home" />
          ) : (
            <SettingsPage
              state={viewState}
              setState={patchState}
              actor={state.session.user}
              setConfirmDialog={setConfirmDialog}
              setNotification={setNotification}
            />
          )
        }
      />
    </>
  );
}
