import React from "react";
import { audit } from "../services/storage";
import { formatHistoryValue, isWithinPastDays } from "../services/historyUtils";
import { Page, Section, Table } from "../components";

function SettingsPage({ state, setState, actor, setConfirmDialog, setNotification }) {
  function toggle(id, keyName) {
    setState((current) => audit({
      state: {
        ...current,
        configurableFields: current.configurableFields.map((field) =>
          field.id === id || `${field.screen}-${field.field}` === id ? { ...field, [keyName]: !field[keyName] } : field
        )
      },
      actor,
      action: "update",
      tableName: "configurable_fields",
      recordId: id
    }));
  }

  return (
    <Page title="Settings" subtitle="No-code field control for each group" action={null}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {['Screen', 'Field', 'Mandatory', 'Hidden', 'Editable', 'Read only'].map((header) => <th key={header}>{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {state.configurableFields.map((field) => {
              const id = field.id ?? `${field.screen}-${field.field}`;
              return (
                <tr key={id}>
                  <td>{field.screen}</td>
                  <td>{field.field}</td>
                  {['mandatory', 'hidden', 'editable', 'readOnly'].map((keyName) => (
                    <td key={keyName}>
                      <label className="switch">
                        <input type="checkbox" checked={field[keyName]} onChange={() => toggle(id, keyName)} />
                        <span>{field[keyName] ? "Yes" : "No"}</span>
                      </label>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Section title="Audit log">
        <Table
          headers={["When", "Actor", "Action", "Table", "Record", "Old value", "New value"]}
          rows={(state.auditLogs || []).filter((log) => isWithinPastDays(log.timestamp, 60) || !log.timestamp).map((log) => [
            new Date(log.timestamp).toLocaleString("en-IN"),
            log.actor,
            log.action,
            log.tableName,
            log.recordId,
            formatHistoryValue(log.oldValue),
            formatHistoryValue(log.newValue)
          ])}
        />
      </Section>
    </Page>
  );
}

export default SettingsPage;
