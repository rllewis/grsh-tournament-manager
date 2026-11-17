import { Component } from "react";

// One bad value should never blank a whole admin page. Catches render errors, says what happened in plain words,
// and offers a retry. `label` names the part of the page that failed.
export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("GRSH admin error in " + (this.props.label || "page") + ":", error, info && info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" style={{ margin: 16, padding: 16, background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 10, color: "#7F1D1D", fontFamily: "system-ui,sans-serif" }}>
        <b>{this.props.label ? `${this.props.label} could not be shown.` : "This page hit a problem."}</b>
        <div style={{ margin: "6px 0 10px", fontSize: 13 }}>Your data is safe — this is a display problem. Try again; if it keeps happening, send the message below to the developer.</div>
        <code style={{ display: "block", fontSize: 12, background: "#fff", padding: 8, borderRadius: 6, marginBottom: 10, overflow: "auto" }}>{String(this.state.error && this.state.error.message || this.state.error)}</code>
        <button onClick={() => this.setState({ error: null })} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #991B1B", background: "#fff", color: "#991B1B", cursor: "pointer", fontWeight: 600 }}>Try again</button>
      </div>
    );
  }
}
