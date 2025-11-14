"use client";
import Link from "next/link";
import { useState } from "react";

export default function TestPage2() {
  const [open, setOpen] = useState(false);
  return (
    <div className="page grid min-h-screen" style={{ gridTemplateRows: "56px 1fr" }}>
      <header className="app-header">
        <div className="app-header-inner">
          <button
            id="menu-toggle"
            aria-controls="sidebar"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="btn btn-outline"
          >
            {open ? "Close menu" : "Open menu"}
          </button>
          <strong>Example App</strong>
        </div>
      </header>

      <div className="grid" style={{ gridTemplateColumns: "280px 1fr" }}>
        <aside id="sidebar" hidden={!open} aria-hidden={!open} className="border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <nav aria-label="Sidebar">
            <h2 className="text-sm uppercase tracking-wide text-zinc-500 mb-3">Navigation</h2>
            <ul>
              <li>
                <a href="#intro">Introduction</a>
              </li>
              <li>
                <a href="#news">News</a>
              </li>
              <li>
                <Link className="nav-link" href="/cases/success">More information...</Link>
              </li>
            </ul>
          </nav>
        </aside>
        <main className="p-6">
          <div id="intro" className="card max-w-2xl">
            <h1>Welcome</h1>
            <p>Stay up to date with the latest updates and documentation.</p>
          </div>
          <section id="news" className="card max-w-2xl mt-4">
            <h2>Latest News</h2>
            <p>New features are rolling out this month. Check back soon.</p>
          </section>
        </main>
      </div>
    </div>
  );
}
