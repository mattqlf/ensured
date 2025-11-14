"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ExtrasPage() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [agree, setAgree] = useState(false);
  const [email, setEmail] = useState("");
  const ok = agree && email.trim() !== "";
  useEffect(() => {
    setCount(parseInt(localStorage.getItem("cartCount") || "0", 10));
    setAgree(localStorage.getItem("agreed") === "true");
    setEmail(localStorage.getItem("email") || "");
  }, []);
  useEffect(() => {
    localStorage.setItem("agreed", agree ? "true" : "false");
  }, [agree]);
  useEffect(() => {
    localStorage.setItem("email", email.trim());
  }, [email]);
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #ddd" }}>
        <strong>Extras</strong>
        <nav aria-label="Breadcrumbs"><Link href="/cases/hard/catalog">Back to catalog</Link></nav>
        <div>
          Cart: <strong id="count">{count}</strong>
        </div>
      </header>
      <main style={{ maxWidth: 760, margin: "24px auto", padding: "0 16px" }}>
        <section aria-label="Options" style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16, background: "#fff" }}>
          <h1>Options</h1>
          <div style={{ margin: 12 }}>
            <label style={{ display: "block", margin: "6px 0" }}>
              <input id="agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I agree to the terms
            </label>
            <label style={{ display: "block", margin: "6px 0" }}>
              <input id="expedite" type="checkbox" /> Expedite shipping
            </label>
          </div>
          <div style={{ margin: 12 }}>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 12, margin: 12 }}>
            <button id="continue" className="btn" disabled={!ok} onClick={() => ok && router.push("/cases/hard/review")}>Continue</button>
            <Link className="btn" role="button" href="/cases/hard/catalog">Back</Link>
          </div>
        </section>
      </main>
    </div>
  );
}

