"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function UltraCart() {
  const router = useRouter();
  const [qty, setQty] = useState(0);
  useEffect(() => {
    setQty(parseInt(sessionStorage.getItem("cartQty") || "0", 10));
  }, []);
  useEffect(() => {
    sessionStorage.setItem("cartQty", String(Math.max(0, qty)));
  }, [qty]);
  const inc = () => setQty((n) => n + 1);
  const dec = () => setQty((n) => Math.max(0, n - 1));
  const ok = qty >= 1;
  return (
    <div className="page">
      <header className="app-header">
        <div className="app-header-inner">
          <strong className="text-lg">Cart</strong>
          <nav aria-label="Breadcrumbs"><Link className="nav-link" href="/cases/ultra/portal">Back</Link></nav>
          <div>
            Items: <strong id="count">{qty}</strong>
          </div>
        </div>
      </header>
      <main className="container">
        <section className="card" aria-label="Items">
          <h1 className="text-2xl font-semibold">Items</h1>
          <div className="row" role="group" aria-label="Item One">
            <span>Item One</span>
            <button id="dec" className="btn btn-secondary" aria-label="Decrease" onClick={dec}>
              -
            </button>
            <span id="qty" aria-live="polite" className="px-3 py-1 rounded bg-zinc-100 dark:bg-zinc-800">
              {qty}
            </span>
            <button id="inc" className="btn btn-secondary" aria-label="Increase" onClick={inc}>
              +
            </button>
          </div>
          <div className="row">
            <button id="continue" className="btn btn-primary" disabled={!ok} onClick={() => ok && router.push("/cases/ultra/payment")}>Continue</button>
          </div>
        </section>
      </main>
    </div>
  );
}
