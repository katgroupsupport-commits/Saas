export function formatHistoryValue(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function isPendingFinancialStatus(status) {
  return String(status ?? "").toUpperCase() === "PENDING";
}

export function isWithinPastDays(dateValue, days = 60) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  const compareDate = new Date();
  compareDate.setDate(compareDate.getDate() - days);
  return date >= compareDate;
}
