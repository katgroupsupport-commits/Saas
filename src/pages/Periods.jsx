import React, { useMemo, useState } from "react";
import { Page, Section, FormCard, Field, Table } from "../components";
import { repository } from "../services/repository";
import { toIsoDateValue } from "../services/financeFields";

const formatCurrency = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));

function serializeError(error) {
  return error?.message || String(error);
}

export default function Periods({ state, setState, setNotification }) {
  const group = state.groups?.[0] ?? {};
  const periods = useMemo(
    () => (state.periods || []).filter((period) => String(period.groupId) === String(group.id)),
    [state.periods, group.id]
  );
  const [form, setForm] = useState({
    name: "",
    startDate: toIsoDateValue(new Date()),
    endDate: toIsoDateValue(new Date())
  });
  const [errors, setErrors] = useState({});

  const onCreatePeriod = async (event) => {
    event.preventDefault();
    if (!form.name) {
      setErrors({ name: "Period name is required" });
      return;
    }
    if (!form.startDate || !form.endDate) {
      setErrors({ startDate: "Start and end date are required" });
      return;
    }

    try {
      const period = await repository.ensurePeriod({
        groupId: group.id,
        name: form.name,
        startDate: form.startDate,
        endDate: form.endDate,
        status: "FUTURE"
      }, group.id);
      setState((current) => ({
        ...current,
        periods: [period, ...(current.periods || [])]
      }));
      setNotification({ type: "success", message: "Accounting period created" });
      setForm({ name: "", startDate: toIsoDateValue(new Date()), endDate: toIsoDateValue(new Date()) });
      setErrors({});
    } catch (error) {
      setNotification({ type: "error", message: "Unable to create period", details: serializeError(error) });
    }
  };

  const onOpenPeriod = async (period) => {
    try {
      const opened = await repository.openAccountingPeriod(group.id, period);
      setState((current) => ({
        ...current,
        periods: (current.periods || []).map((p) => (p.id === opened.id ? opened : p))
      }));
      setNotification({ type: "success", message: `Period ${opened.name} is now open` });
    } catch (error) {
      setNotification({ type: "error", message: "Unable to open period", details: serializeError(error) });
    }
  };

  const onClosePeriod = async (period) => {
    if (!period?.id) return;
    try {
      const closed = await repository.closeAccountingPeriod(period.id);
      setState((current) => ({
        ...current,
        periods: (current.periods || []).map((p) => (p.id === closed.id ? closed : p))
      }));
      setNotification({ type: "success", message: `Period ${closed.name} closed` });
    } catch (error) {
      setNotification({ type: "error", message: "Unable to close period", details: serializeError(error) });
    }
  };

  return (
    <Page title="Accounting Periods" subtitle="Manage group accounting windows">
      <Section title="Create Accounting Period">
        <FormCard onSubmit={onCreatePeriod}>
          <Field
            label="Period Name"
            name="name"
            type="text"
            value={form.name}
            onChange={(value) => setForm((current) => ({ ...current, name: value }))}
            required
            error={errors.name}
          />
          <Field
            label="Start Date"
            name="startDate"
            type="date"
            value={form.startDate}
            onChange={(value) => setForm((current) => ({ ...current, startDate: value }))}
            required
            error={errors.startDate}
          />
          <Field
            label="End Date"
            name="endDate"
            type="date"
            value={form.endDate}
            onChange={(value) => setForm((current) => ({ ...current, endDate: value }))}
            required
            error={errors.endDate}
          />
          <button type="submit" className="button button-primary">
            Create Period
          </button>
        </FormCard>
      </Section>
      <Section title="Existing Periods">
        {periods.length === 0 ? (
          <p className="section-note">No accounting periods defined for this group yet.</p>
        ) : (
          <Table
            headers={["Name", "Start", "End", "Status", "Actions"]}
            rows={periods.map((period) => [
              period.name,
              period.startDate,
              period.endDate,
              period.status || period.periodStatus || "-",
              <div className="button-group" key={`actions-${period.id}`}>
                <button type="button" className="button button-secondary" onClick={() => onOpenPeriod(period)}>
                  Open
                </button>
                <button type="button" className="button button-secondary" onClick={() => onClosePeriod(period)}>
                  Close
                </button>
              </div>
            ])}
          />
        )}
      </Section>
    </Page>
  );
}
