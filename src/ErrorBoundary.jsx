import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="auth-page">
          <section className="auth-panel">
            <p className="eyebrow">Bachat Gat SaaS</p>
            <h1>App startup error</h1>
            <p>{this.state.error.message}</p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
