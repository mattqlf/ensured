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
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #ddd" }}>
        <strong>Demo Store</strong>
        <nav aria-label="Main">
          <Link href="/cases/test-page">Home</Link>{" "}
          <span aria-hidden> </span>
          <Link href="/cases/hard/catalog">Catalog</Link>
        </nav>
        <div>
          <button id="checkout" className="btn" aria-disabled={!enabled} disabled={!enabled} onClick={() => enabled && router.push("/cases/hard/review")}>Checkout ({count})</button>
        </div>
      </header>
      <main style={{ maxWidth: 960, margin: "24px auto", padding: "0 16px" }}>
        <section aria-label="Welcome" style={{ display: "grid", gap: 12, padding: 24, border: "1px solid #ddd", borderRadius: 12, background: "#fff" }}>
          <h1>Welcome</h1>
          <p>Explore the catalog and complete your purchase.</p>
          <div style={{ display: "flex", gap: 12 }}>
            <Link className="btn" role="button" href="/cases/hard/catalog">Browse catalog</Link>
          </div>
        </section>
      </main>
    </div>
  );
}

