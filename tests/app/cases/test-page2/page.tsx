"use client";
import Link from "next/link";
import { useState } from "react";

export default function TestPage2() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: "grid", gridTemplateRows: "56px 1fr", minHeight: "100vh", background: "#f7f7f9", color: "#111", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderBottom: "1px solid #ddd", background: "#fff" }}>
        <button
          id="menu-toggle"
          aria-controls="sidebar"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          style={{ border: "1px solid #ddd", background: "#fff", padding: "8px 12px", borderRadius: 8, cursor: "pointer" }}
        >
          {open ? "Close menu" : "Open menu"}
        </button>
        <strong>Example App</strong>
      </header>

      <div className="layout" style={{ display: "grid", gridTemplateColumns: "280px 1fr" }}>
        <aside id="sidebar" hidden={!open} aria-hidden={!open} style={{ borderRight: "1px solid #ddd", background: "#fff", padding: 16 }}>
          <nav aria-label="Sidebar">
            <h2 style={{ margin: "0 0 12px", fontSize: 14, color: "#555", textTransform: "uppercase", letterSpacing: ".04em" }}>Navigation</h2>
            <ul>
              <li>
                <a href="#intro">Introduction</a>
              </li>
              <li>
                <a href="#news">News</a>
              </li>
              <li>
                <Link href="/cases/success">More information...</Link>
              </li>
            </ul>
          </nav>
        </aside>
        <main style={{ padding: 24 }}>
          <div id="intro" style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 10, padding: 16, maxWidth: 720 }}>
            <h1>Welcome</h1>
            <p>Stay up to date with the latest updates and documentation.</p>
          </div>
          <section id="news" style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 10, padding: 16, maxWidth: 720, marginTop: 16 }}>
            <h2>Latest News</h2>
            <p>New features are rolling out this month. Check back soon.</p>
          </section>
        </main>
      </div>
    </div>
  );
}

