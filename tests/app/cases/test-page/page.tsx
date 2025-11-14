"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function TestPage() {
  const [count, setCount] = useState(0);
  const status = `Status: Clicked ${count} time${count === 1 ? "" : "s"}`;

  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <h1>Welcome</h1>
      <p>Explore the content below or use the navigation.</p>
      <p>
        <Link href="/cases/success">More information...</Link>
      </p>

      <section aria-label="Controls" style={{ marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid #ddd" }}>
        <button id="counter" onClick={() => setCount((c) => c + 1)}>
          Click me
        </button>
        <h2 id="status" aria-live="polite">
          {count === 0 ? "Status: Idle" : status}
        </h2>

        <label htmlFor="name" style={{ display: "block", marginTop: "1rem" }}>
          Name
        </label>
        <input id="name" type="text" placeholder="Your name" style={{ padding: ".4rem", width: "100%", maxWidth: 320 }} />
      </section>
    </main>
  );
}

