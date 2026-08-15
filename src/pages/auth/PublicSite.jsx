import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthScreen } from './AuthScreen.jsx';
import { AboutPage, PricingPage, ContactPage, PolicyPage } from './PublicPages.jsx';
import { GuidePage } from './GuidePage.jsx';

/**
 * PublicSite component wraps all public routes
 * Routes: /login, /about, /pricing, /contact, /privacy, /terms, /guide
 */
export function PublicSite() {
  const location = useLocation();

  return (
    <main className="public-shell">
      <Routes>
        <Route path="/" element={<Navigate replace to="/login" state={{ from: '/' }} />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PolicyPage type="privacy" />} />
        <Route path="/terms" element={<PolicyPage type="terms" />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/login" element={<AuthScreen />} />
        <Route path="*" element={<Navigate replace to="/login" state={{ from: location.pathname }} />} />
      </Routes>
    </main>
  );
}
