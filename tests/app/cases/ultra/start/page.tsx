"use client";
import Link from "next/link";

export default function UltraStart() {
  return (
    <div className="page">
      <header className="app-header">
        <div className="app-header-inner">
          <strong className="text-lg">Ultra Demo</strong>
          <nav aria-label="Main" className="flex gap-4">
            <Link className="nav-link" href="/cases/test-page">Home</Link>
            <Link className="nav-link" href="/cases/ultra/portal">Portal</Link>
          </nav>
          <div></div>
        </div>
      </header>
      <main className="container">
        <section className="card" aria-label="Intro">
          <h1 className="text-3xl font-semibold">Start</h1>
          <p className="text-zinc-600 dark:text-zinc-400">Explore the portal and complete the flow.</p>
          <p className="mt-4">
            <Link className="btn btn-primary" role="button" href="/cases/ultra/portal">
              Enter portal
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
