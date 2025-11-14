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
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #ddd" }}>
        <strong>Cart</strong>
        <nav aria-label="Breadcrumbs"><Link href="/cases/ultra/portal">Back</Link></nav>
        <div>
          Items: <strong id="count">{qty}</strong>
        </div>
      </header>
      <main style={{ maxWidth: 760, margin: "24px auto", padding: "0 16px" }}>
        <section className="card" aria-label="Items" style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16, background: "#fff" }}>
          <h1>Items</h1>
          <div className="row" role="group" aria-label="Item One" style={{ display: "flex", gap: 8, alignItems: "center", margin: 8 }}>
            <span>Item One</span>
            <button id="dec" className="btn" aria-label="Decrease" onClick={dec}>
              -
            </button>
            <span id="qty" aria-live="polite">
              {qty}
            </span>
            <button id="inc" className="btn" aria-label="Increase" onClick={inc}>
              +
            </button>
          </div>
          <div className="row" style={{ display: "flex", gap: 8, alignItems: "center", margin: 8 }}>
            <button id="continue" className="btn" disabled={!ok} onClick={() => ok && router.push("/cases/ultra/payment")}>Continue</button>
          </div>
        </section>
      </main>
    </div>
  );
}

