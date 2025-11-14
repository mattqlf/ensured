"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function TestPage() {
  const [count, setCount] = useState(0);
  const status = `Status: Clicked ${count} time${count === 1 ? "" : "s"}`;

  return (
    <div className="page">
      <main className="container">
        <div className="card">
          <h1 className="text-3xl font-semibold">Welcome</h1>
          <p className="text-zinc-600 dark:text-zinc-400">Explore the content below or use the navigation.</p>
          <p className="mt-4">
            <Link className="btn btn-primary" href="/cases/success">More information...</Link>
          </p>

          <section aria-label="Controls" className="mt-6 border-t border-zinc-200 dark:border-zinc-800 pt-4">
            <div className="row">
              <button id="counter" className="btn btn-secondary" onClick={() => setCount((c) => c + 1)}>
                Click me
              </button>
              <h2 id="status" aria-live="polite" className="text-lg font-medium">
                {count === 0 ? "Status: Idle" : status}
              </h2>
            </div>

            <label htmlFor="name" className="label mt-4">Name</label>
            <input id="name" className="input" type="text" placeholder="Your name" />
          </section>
        </div>
      </main>
    </div>
  );
}
