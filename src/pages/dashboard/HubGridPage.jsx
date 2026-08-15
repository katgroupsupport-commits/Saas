import React from "react";
import { useNavigate } from "react-router-dom";

export default function HubGridPage({ title, items }) {
  const navigate = useNavigate();
  return (
    <section className="hub-grid-page">
      <div className="hub-grid">
        {items.map((item) => {
          const Icon = item.Icon;
          return (
            <button key={item.to} type="button" className="hub-tile" onClick={() => navigate(item.to)}>
              <div className="hub-tile-icon">
                <Icon size={28} />
              </div>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
