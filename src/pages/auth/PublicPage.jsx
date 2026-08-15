import React from 'react';
import { NavLink } from 'react-router-dom';

/**
 * Base page layout for public pages (About, Pricing, Contact, etc.)
 */
export function PublicPage({ title, subtitle, children, showFooter = true }) {
  return (
    <div className="public-page">
      <div className="page-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {children}
      {showFooter && (
        <footer className="public-footer">
          <NavLink to="/privacy">Privacy Policy</NavLink>
          <NavLink to="/terms">Terms & Conditions</NavLink>
          <NavLink to="/guide">User Guide</NavLink>
        </footer>
      )}
    </div>
  );
}

/**
 * Grid of cards for displaying items
 */
export function CardGrid({ items }) {
  return (
    <div className="data-grid">
      {items.map((item) => (
        <article className="entity-card" key={item.title}>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
        </article>
      ))}
    </div>
  );
}

/**
 * Section with tag list
 */
export function PublicSection({ title, items }) {
  return (
    <section className="section">
      <h3>{title}</h3>
      <div className="tag-list">
        {items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </section>
  );
}
