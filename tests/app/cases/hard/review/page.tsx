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
    <div className="page">
      <header className="app-header">
        <div className="app-header-inner">
          <strong className="text-lg">Review</strong>
          <nav aria-label="Breadcrumbs" className="flex items-center gap-2">
            <Link className="nav-link" href="/cases/hard/catalog">Catalog</Link>
            <span aria-hidden className="text-zinc-400">/</span>
            <Link className="nav-link" href="/cases/hard/extras">Extras</Link>
          </nav>
          <div>
            Cart: <strong id="count">{count}</strong>
          </div>
        </div>
      </header>
      <main className="container">
        <section className="card" aria-label="Summary">
          <h1 className="text-2xl font-semibold">Order Summary</h1>
          <p>
            Items: <strong id="items">{count}</strong>
          </p>
          <p>
            Email: <strong id="email">{email || "—"}</strong>
          </p>
          <p>
            Agreed: <strong id="agreed">{String(agreed)}</strong>
          </p>
          <p id="msg" className="text-red-700" role="status" aria-live="polite">
            {msg}
          </p>
          <div className="row mt-2">
            <Link className="btn btn-secondary" role="button" href="/cases/hard/extras">
              Back
            </Link>
            <button id="place" className="btn btn-primary" onClick={place}>
              Place order
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
