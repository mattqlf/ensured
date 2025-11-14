"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ReviewPage() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    setCount(parseInt(localStorage.getItem("cartCount") || "0", 10));
    setEmail(localStorage.getItem("email") || "");
    setAgreed(localStorage.getItem("agreed") === "true");
  }, []);

  function place() {
    const n = parseInt(localStorage.getItem("cartCount") || "0", 10);
    const email = localStorage.getItem("email") || "";
    const agreed = localStorage.getItem("agreed") === "true";
    if (n >= 2 && email.trim() !== "" && agreed) {
      router.push("/cases/success");
    } else {
      setMsg("Please ensure at least 2 items, agreement to terms, and a valid email.");
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #ddd" }}>
        <strong>Review</strong>
        <nav aria-label="Breadcrumbs">
          <Link href="/cases/hard/catalog">Catalog</Link>
          <span aria-hidden style={{ margin: "0 4px" }}>/</span>
          <Link href="/cases/hard/extras">Extras</Link>
        </nav>
        <div>
          Cart: <strong id="count">{count}</strong>
        </div>
      </header>
      <main style={{ maxWidth: 760, margin: "24px auto", padding: "0 16px" }}>
        <section className="card" aria-label="Summary" style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16, background: "#fff" }}>
          <h1>Order Summary</h1>
          <p>
            Items: <strong id="items">{count}</strong>
          </p>
          <p>
            Email: <strong id="email">{email || "—"}</strong>
          </p>
          <p>
            Agreed: <strong id="agreed">{String(agreed)}</strong>
          </p>
          <p id="msg" className="warn" role="status" aria-live="polite" style={{ color: "#b30000" }}>
            {msg}
          </p>
          <div className="row" style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
            <Link className="btn" role="button" href="/cases/hard/extras">
              Back
            </Link>
            <button id="place" className="btn" onClick={place}>
              Place order
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

