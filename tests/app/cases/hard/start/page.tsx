"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function HardStart() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  useEffect(() => {
    const n = parseInt(localStorage.getItem("cartCount") || "0", 10);
    setCount(n);
    if (!localStorage.getItem("agreed")) localStorage.setItem("agreed", "false");
  }, []);
  useEffect(() => {
    const id = setInterval(() => {
      const n = parseInt(localStorage.getItem("cartCount") || "0", 10);
      setCount(n);
    }, 300);
    return () => clearInterval(id);
  }, []);

  const enabled = count >= 2;

  return (
    <div className="page">
      <header className="app-header">
        <div className="app-header-inner">
          <strong className="text-lg">Demo Store</strong>
          <nav aria-label="Main" className="flex gap-4">
            <Link className="nav-link" href="/cases/test-page">Home</Link>
            <Link className="nav-link" href="/cases/hard/catalog">Catalog</Link>
          </nav>
          <div>
            <button id="checkout" className="btn btn-primary" aria-disabled={!enabled} disabled={!enabled} onClick={() => enabled && router.push("/cases/hard/review")}>Checkout ({count})</button>
          </div>
        </div>
      </header>
      <main className="container">
        <section aria-label="Welcome" className="card grid gap-3">
          <h1 className="text-3xl font-semibold">Welcome</h1>
          <p className="text-zinc-600 dark:text-zinc-400">Explore the catalog and complete your purchase.</p>
          <div className="flex gap-3">
            <Link className="btn btn-secondary" role="button" href="/cases/hard/catalog">Browse catalog</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
