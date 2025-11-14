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
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #ddd" }}>
        <strong>Catalog</strong>
        <nav aria-label="Breadcrumbs"><Link href="/cases/hard/start">Home</Link></nav>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span aria-live="polite">Cart: <strong id="count">{count}</strong></span>
          <Link id="to-review" className="btn" role="button" aria-disabled={!ok} href={toReviewHref} tabIndex={ok ? 0 : -1}>
            Go to review
          </Link>
        </div>
      </header>
      <main style={{ maxWidth: 1000, margin: "24px auto", padding: "0 16px" }}>
        <div role="list" aria-label="Products" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
          {[
            { name: "Alpha Gadget", desc: "Compact and powerful." },
            { name: "Beta Widget", desc: "Reliable and efficient." },
            { name: "Gamma Thing", desc: "Versatile everyday helper." },
            { name: "Delta Device", desc: "Built for performance." },
          ].map((p) => (
            <div key={p.name} role="listitem" style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, background: "#fff" }}>
              <h2>{p.name}</h2>
              <p>{p.desc}</p>
              <button className="btn add" onClick={add}>Add to cart</button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 12, borderTop: "1px solid #ddd" }}>
          <Link className="btn" role="button" href="/cases/hard/start">Back</Link>
          <button id="continue" className="btn" disabled={!ok} onClick={() => ok && router.push("/cases/hard/extras")}>Continue</button>
        </div>
      </main>
    </div>
  );
}

