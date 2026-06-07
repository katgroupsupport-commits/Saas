export const periodStatuses = {
  FUTURE: "Future",
  OPEN: "Open",
  CLOSED: "Closed",
  PERMANENTLY_CLOSED: "Permanently Closed"
};

export function getOpenPeriod(periods) {
  return periods.find((period) => period.status === periodStatuses.OPEN);
}

export function canPostTransaction(periods, transactionDate) {
  const openPeriod = getOpenPeriod(periods);
  if (!openPeriod) {
    return { allowed: true, period: null };
  }

  const date = new Date(transactionDate);
  const start = new Date(openPeriod.startDate);
  const end = new Date(openPeriod.endDate);

  if (date < start || date > end) {
    return {
      allowed: false,
      reason: `Transactions are allowed only in ${openPeriod.name}.`
    };
  }

  return { allowed: true, period: openPeriod };
}

export function openPeriod(periods, periodId) {
  return periods.map((period) => {
    if (period.id === periodId) {
      return { ...period, status: periodStatuses.OPEN };
    }

    if (period.status === periodStatuses.OPEN) {
      return { ...period, status: periodStatuses.CLOSED };
    }

    return period;
  });
}

export function getCurrentMonthPeriod(periods) {
  const today = new Date();
  return periods.find((period) => {
    const start = new Date(period.startDate);
    const end = new Date(period.endDate);
    return today >= start && today <= end;
  });
}
