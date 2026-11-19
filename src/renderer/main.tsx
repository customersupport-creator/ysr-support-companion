import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

class Boundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error): { error: string } {
    return { error: error.message };
  }

  render() {
    if (this.state.error) {
      return <div className="boot">YSR Desk hit an error: {this.state.error}</div>;
    }
    return this.props.children;
  }
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <Boundary>
      <App />
    </Boundary>,
  );
}
