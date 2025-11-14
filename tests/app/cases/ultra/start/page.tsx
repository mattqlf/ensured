"use client";
import Link from "next/link";

export default function UltraStart() {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #ddd" }}>
        <strong>Ultra Demo</strong>
        <nav aria-label="Main">
          <Link href="/cases/test-page">Home</Link>
          <span aria-hidden> </span>
          <Link href="/cases/ultra/portal">Portal</Link>
        </nav>
        <div></div>
      </header>
      <main style={{ maxWidth: 960, margin: "24px auto", padding: "0 16px" }}>
        <section className="card" aria-label="Intro" style={{ border: "1px solid #ddd", borderRadius: 12, padding: 24, background: "#fff" }}>
          <h1>Start</h1>
          <p>Explore the portal and complete the flow.</p>
          <p>
            <Link className="btn" role="button" href="/cases/ultra/portal">
              Enter portal
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}

