import React, { useState, useEffect, useMemo } from "react";

const bilingualLabels = {
  Dashboard: "डॅशबोर्ड (Dashboard)",
  "Group Dashboard": "गट डॅशबोर्ड (Group Dashboard)",
  "Member Dashboard": "सभासद डॅशबोर्ड (Member Dashboard)",
  "My Dashboard": "माझा डॅशबोर्ड (My Dashboard)",
  Members: "सभासद (Members)",
  Setup: "सेटअप (Setup)",
  Operations: "व्यवहार (Operations)",
  Transactions: "व्यवहार (Transactions)",
  Loans: "कर्ज (Loans)",
  Withdrawals: "पैसे काढणे (Withdrawals)",
  "Pending Dues": "बाकी रक्कम (Pending Dues)",
  Corrections: "दुरुस्ती (Corrections)",
  Approvals: "मंजुरी (Approvals)",
  "Reports & Audit": "रिपोर्ट व ऑडिट (Reports & Audit)",
  Contact: "संपर्क (Contact)",
  Subscriptions: "सबस्क्रिप्शन (Subscriptions)",
  "AI Agent": "AI सहाय्यक (AI Agent)",
  "User Guide": "वापर मार्गदर्शक (User Guide)",
  "Full name": "पूर्ण नाव (Full Name)",
  Member: "सभासद (Member)",
  Email: "ईमेल (Email)",
  "Mobile number": "मोबाइल नंबर (Mobile number)",
  Name: "नाव (Name)",
  Password: "पासवर्ड (Password)",
  "Confirm password": "पासवर्ड पुन्हा टाका (Confirm password)",
  "Create new group": "नवीन गट तयार करा (Create new group)",
  "Loan amount": "कर्ज रक्कम (Loan amount)",
  Status: "स्थिती (Status)",
  "No records yet": "अद्याप नोंदी नाहीत (No records yet)",
  "No groups yet": "अद्याप कोणतेही गट नाहीत (No groups yet)",
  "Your groups": "आपले गट (Your groups)",
  "Hidden groups": "लपविलेले गट (Hidden groups)",
  "Select a group": "गट निवडा (Select a group)",
  "Select member": "सभासद निवडा (Select member)"
};

export function bilingual(label) {
  return bilingualLabels[label] || label;
}

export function Page({ title, subtitle, action, children }) {
  return (
    <section className="page">
      {action && <div className="page-actions">{action}</div>}
      {children}
    </section>
  );
}

export function MetricGrid({ metrics }) {
  const renderDetail = (detail, index) => {
    if (typeof detail !== "string") return <span key={index}>{detail}</span>;
    const separatorIndex = detail.indexOf(":");
    if (separatorIndex <= 0) return <span key={index} className="metric-subfield full">{detail}</span>;
    const label = detail.slice(0, separatorIndex).trim();
    const value = detail.slice(separatorIndex + 1).trim();
    return (
      <span key={`${label}-${index}`} className="metric-subfield">
        <span>{label}</span>
        <strong>{value || "-"}</strong>
      </span>
    );
  };

  return (
    <div className="metric-grid">
      {metrics.map((item) => {
        const metricItem = Array.isArray(item)
          ? { label: item[0], value: item[1], Icon: item[2], details: item[3] || [] }
          : item;
        const Icon = metricItem.Icon;
        return (
          <article className="metric-card" key={metricItem.label}>
            <Icon size={21} />
            <span>{bilingual(metricItem.label)}</span>
            <strong>{metricItem.value}</strong>
            {metricItem.details?.length > 0 && (
              <div className="metric-detail">{metricItem.details.map(renderDetail)}</div>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function Section({ title, children }) {
  return (
    <section className="section">
      <h3>{bilingual(title)}</h3>
      {children}
    </section>
  );
}

export function FormCard({ title, onSubmit, children, hideSubmit }) {
  return (
    <section className="section">
      <form className="form-grid" onSubmit={onSubmit}>
        {children}
        {!hideSubmit && <button className="primary-button" type="submit">Save</button>}
      </form>
    </section>
  );
}

export function Field({ label, name, value, onChange, type = "text", error, required = false, disabled = false, autoComplete }) {
  return (
    <label className="field">
      <span>{bilingual(label)}{required ? " *" : " (Optional)"}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onWheel={(event) => {
          if (type === "number") event.currentTarget.blur();
        }}
      />
      {error && <small>{error}</small>}
    </label>
  );
}

export function SelectField({ label, value, onChange, options, error, required = false, placeholder = "" }) {
  return (
    <label className="field">
      <span>{bilingual(label)}{required ? " *" : " (Optional)"}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => {
          const item = typeof option === "string" ? { label: option, value: option } : option;
          return <option key={item.value} value={item.value}>{item.label}</option>;
        })}
      </select>
      {error && <small>{error}</small>}
    </label>
  );
}

export function ComboField({ label, value, onChange, options = [], error, required = false, placeholder = "" }) {
  const [inputText, setInputText] = useState("");
  const optionsByLabel = useMemo(() => {
    const map = new Map();
    options.forEach((opt) => map.set(String(opt.label), opt.value));
    return map;
  }, [options]);

  useEffect(() => {
    const match = options.find((o) => String(o.value) === String(value));
    setInputText(match ? match.label : "");
  }, [value, options]);

  function handleChange(ev) {
    const txt = ev.target.value;
    setInputText(txt);
  }

  function commitSelection(txt) {
    if (!txt) {
      onChange("");
      return;
    }
    const q = String(txt).toLowerCase();
    const found = options.find((o) => String(o.label).toLowerCase().includes(q) || String(o.code || "").toLowerCase().includes(q));
    if (found) onChange(found.value);
    else onChange("");
  }

  function handleBlur() {
    commitSelection(inputText);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitSelection(inputText);
    }
  }

  const datalistId = `combo-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <label className="field">
      <span>{bilingual(label)}{required ? " *" : " (Optional)"}</span>
      <input
        list={datalistId}
        value={inputText}
        placeholder={placeholder}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      <datalist id={datalistId}>
        {options.map((option) => (
          <option key={option.value} value={option.label} />
        ))}
      </datalist>
      {error && <small>{error}</small>}
    </label>
  );
}

export function ToggleCell({ field, id, keyName, onToggle }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={Boolean(field[keyName])} onChange={() => onToggle(id, keyName)} />
      <span>{field[keyName] ? "Yes" : "No"}</span>
    </label>
  );
}

export function Table({ headers, rows }) {
  const cellTitle = (cell) => {
    if (cell === null || cell === undefined) return "";
    if (typeof cell === "string" || typeof cell === "number") return String(cell);
    if (Array.isArray(cell)) return cell.map(cellTitle).filter(Boolean).join(" \n");
    return "";
  };

  const renderCell = (cell) => {
    if (cell === null || cell === undefined) return null;
    if (typeof cell === "string" || typeof cell === "number") return String(cell);
    if (Array.isArray(cell)) return cell.map((item, index) => <span key={index} style={{ marginRight: 8 }}>{renderCell(item)}</span>);
    return cell;
  };

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{headers.map((header) => <th key={header}>{bilingual(header)}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td className="empty-table-cell" colSpan={headers.length}>{bilingual("No records yet")}</td></tr>
          ) : rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, index) => <td key={`${rowIndex}-${index}`} title={cellTitle(cell)}>{renderCell(cell)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProfilePhoto({ photo, name, large = false }) {
  const initial = String(name || "U").trim().charAt(0).toUpperCase() || "U";
  return (
    <span className={`profile-photo ${large ? "profile-photo-large" : ""}`}>
      {photo ? <img src={photo} alt="" /> : <span>{initial}</span>}
    </span>
  );
}
