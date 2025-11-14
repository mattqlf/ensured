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
    <div className="page">
      <header className="app-header">
        <div className="app-header-inner">
          <strong className="text-lg">Extras</strong>
          <nav aria-label="Breadcrumbs"><Link className="nav-link" href="/cases/hard/catalog">Back to catalog</Link></nav>
          <div>
            Cart: <strong id="count">{count}</strong>
          </div>
        </div>
      </header>
      <main className="container">
        <section aria-label="Options" className="card">
          <h1 className="text-2xl font-semibold">Options</h1>
          <div className="my-3">
            <label className="block my-1">
              <input id="agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I agree to the terms
            </label>
            <label className="block my-1">
              <input id="expedite" type="checkbox" /> Expedite shipping
            </label>
          </div>
          <div className="my-3">
            <label htmlFor="email" className="label">Email</label>
            <input id="email" className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex gap-3 my-3">
            <button id="continue" className="btn btn-primary" disabled={!ok} onClick={() => ok && router.push("/cases/hard/review")}>Continue</button>
            <Link className="btn btn-secondary" role="button" href="/cases/hard/catalog">Back</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
