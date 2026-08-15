import React, { useEffect, useState } from "react";
import { repository } from "../services/repository";
import { toIsoDateValue } from "../services/financeFields";
import { Page, Section, Field, Table } from "../components";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

function formatDate(value) {
  if (!value) return "-";
  return String(value).slice(0, 10);
}

function getDefaultStartDate(endDate) {
  const date = new Date(endDate);
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().slice(0, 10);
}

export default function ShareDistribution({ state, actor, setNotification }) {
  const groupId = state.groups?.[0]?.id ?? null;
  const today = toIsoDateValue();
  const [referenceDate, setReferenceDate] = useState(today);
  const [rangeStartDate, setRangeStartDate] = useState(getDefaultStartDate(today));
  const [rangeEndDate, setRangeEndDate] = useState(today);
  const [snapshotRows, setSnapshotRows] = useState([]);
  const [rangeRows, setRangeRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadShares() {
      if (!groupId) return;
      setLoading(true);
      setError(null);

      try {
        const [snapshot, range] = await Promise.all([
          repository.getShareDistributionSnapshot({ groupId, referenceDate }),
          repository.getShareDistributionRange({ groupId, startDate: rangeStartDate, endDate: rangeEndDate })
        ]);

        if (!active) return;
        setSnapshotRows(Array.isArray(snapshot) ? snapshot : []);
        setRangeRows(Array.isArray(range) ? range : []);
      } catch (err) {
        if (!active) return;
        setError(err.message || String(err));
        setSnapshotRows([]);
        setRangeRows([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadShares();
    return () => { active = false; };
  }, [groupId, referenceDate, rangeStartDate, rangeEndDate]);

  const rangeTotal = rangeRows.reduce((sum, row) => sum + Number(row.share_amount ?? row.shareAmount ?? 0), 0);
  const snapshotTotal = snapshotRows.reduce((sum, row) => sum + Number(row.share_amount ?? row.shareAmount ?? 0), 0);

  return (
    <Page title="Share Distribution" subtitle="Member share payout snapshot and range summary" action={null}>
      <Section title="Payout dates">
        <div className="form-grid single-control-form" style={{ gap: 16 }}>
          <Field label="Snapshot reference date" type="date" value={referenceDate} onChange={setReferenceDate} />
          <Field label="Range start date" type="date" value={rangeStartDate} onChange={setRangeStartDate} />
          <Field label="Range end date" type="date" value={rangeEndDate} onChange={setRangeEndDate} />
        </div>
        <p className="section-note">Values are loaded from the server using share distribution RPCs.</p>
      </Section>

      <Section title="Share payout snapshot">
        {loading ? (
          <p className="section-note">Loading snapshot…</p>
        ) : error ? (
          <p className="section-note error-text">{error}</p>
        ) : (
          <>
            <div className="status-row" style={{ gap: 24, marginBottom: 16 }}>
              <div>
                <strong>Total snapshot share</strong>
                <p>{currency.format(snapshotTotal)}</p>
              </div>
              <div>
                <strong>Reference date</strong>
                <p>{formatDate(referenceDate)}</p>
              </div>
              <div>
                <strong>Members</strong>
                <p>{snapshotRows.length}</p>
              </div>
            </div>
            <Table
              headers={["Member", "Share amount", "Share %", "Payout status"]}
              rows={snapshotRows.map((row) => [
                row.member_name || row.memberName || "-",
                currency.format(Number(row.share_amount ?? row.shareAmount ?? 0)),
                `${Number(row.share_percent ?? row.sharePercent ?? 0).toFixed(2)}%`,
                row.payout_status || row.payoutStatus || "-"
              ])}
            />
            {snapshotRows.length === 0 && <p className="section-note">No snapshot rows returned for this date.</p>}
          </>
        )}
      </Section>

      <Section title="Range distribution summary">
        {loading ? (
          <p className="section-note">Loading range summary…</p>
        ) : error ? (
          <p className="section-note error-text">{error}</p>
        ) : (
          <>
            <div className="status-row" style={{ gap: 24, marginBottom: 16 }}>
              <div>
                <strong>Total range share</strong>
                <p>{currency.format(rangeTotal)}</p>
              </div>
              <div>
                <strong>Range start</strong>
                <p>{formatDate(rangeStartDate)}</p>
              </div>
              <div>
                <strong>Range end</strong>
                <p>{formatDate(rangeEndDate)}</p>
              </div>
            </div>
            <Table
              headers={["Member", "Share amount", "Share %", "Payout status"]}
              rows={rangeRows.map((row) => [
                row.member_name || row.memberName || "-",
                currency.format(Number(row.share_amount ?? row.shareAmount ?? 0)),
                `${Number(row.share_percent ?? row.sharePercent ?? 0).toFixed(2)}%`,
                row.payout_status || row.payoutStatus || "-"
              ])}
            />
            {rangeRows.length === 0 && <p className="section-note">No range distribution rows returned for this period.</p>}
          </>
        )}
      </Section>
    </Page>
  );
}
