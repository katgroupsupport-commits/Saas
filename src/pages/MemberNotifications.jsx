import React, { useEffect } from "react";
import { Page, Section } from "../components";

function MemberNotifications({ state, setState, actor, setConfirmDialog, setNotification }) {
  useEffect(() => {
    if (!(state.notifications || []).some((notification) => !notification.read)) return;
    const visibleIds = new Set((state.notifications || []).map((notification) => String(notification.id)));
    setState((current) => ({
      ...current,
      notifications: (current.notifications || []).map((notification) =>
        visibleIds.has(String(notification.id)) ? { ...notification, read: true } : notification
      )
    }));
  }, []);

  const notifications = state.notifications || [];

  return (
    <Page title="Notifications" subtitle="Your messages and alerts" action={null}>
      <Section title="Recent Notifications">
        {notifications.length === 0 ? (
          <p className="section-note">No notifications yet.</p>
        ) : (
          <div className="notification-list">
            {notifications.map((notif) => (
              <div key={notif.id} className={`notification-item ${notif.type}`}>
                <strong>{notif.title}</strong>
                <p>{notif.body}</p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </Page>
  );
}

export default MemberNotifications;
