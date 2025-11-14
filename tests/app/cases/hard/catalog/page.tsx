"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function CatalogPage() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!localStorage.getItem("cartCount")) localStorage.setItem("cartCount", "0");
    setCount(parseInt(localStorage.getItem("cartCount") || "0", 10));
  }, []);
  useEffect(() => {
    const id = setInterval(() => setCount(parseInt(localStorage.getItem("cartCount") || "0", 10)), 300);
    return () => clearInterval(id);
  }, []);
  const add = () => {
    const n = parseInt(localStorage.getItem("cartCount") || "0", 10) + 1;
    localStorage.setItem("cartCount", String(n));
    setCount(n);
  };
  const ok = count >= 2;
  const toReviewHref = ok ? "/cases/hard/extras" : "/cases/hard/review";

  return (
    <div className="page">
      <header className="app-header">
        <div className="app-header-inner">
          <strong className="text-lg">Catalog</strong>
          <nav aria-label="Breadcrumbs"><Link className="nav-link" href="/cases/hard/start">Home</Link></nav>
          <div className="flex gap-3 items-center">
            <span aria-live="polite">Cart: <strong id="count">{count}</strong></span>
            <Link id="to-review" className="btn btn-outline" role="button" aria-disabled={!ok} href={toReviewHref} tabIndex={ok ? 0 : -1}>
              Go to review
            </Link>
          </div>
        </div>
      </header>
      <main className="container">
        <div role="list" aria-label="Products" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { name: "Alpha Gadget", desc: "Compact and powerful." },
            { name: "Beta Widget", desc: "Reliable and efficient." },
            { name: "Gamma Thing", desc: "Versatile everyday helper." },
            { name: "Delta Device", desc: "Built for performance." },
          ].map((p) => (
            <div key={p.name} role="listitem" className="card">
              <h2 className="text-xl font-semibold">{p.name}</h2>
              <p className="text-zinc-600 dark:text-zinc-400">{p.desc}</p>
              <button className="btn btn-primary mt-3 add" onClick={add}>Add to cart</button>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-6 border-t border-zinc-200 dark:border-zinc-800 pt-4">
          <Link className="btn btn-secondary" role="button" href="/cases/hard/start">Back</Link>
          <button id="continue" className="btn btn-primary" disabled={!ok} onClick={() => ok && router.push("/cases/hard/extras")}>Continue</button>
        </div>
      </main>
    </div>
  );
}
