"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function UltraPayment() {
  const router = useRouter();
  const [qty, setQty] = useState(0);
  const [pm, setPm] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [cc, setCc] = useState("");
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    setQty(parseInt(sessionStorage.getItem("cartQty") || "0", 10));
  }, []);
  const ok = pm === "card" && name.trim() !== "" && cc.trim() !== "" && confirm;
  return (
    <div className="page">
      <header className="app-header">
        <div className="app-header-inner">
          <strong className="text-lg">Payment</strong>
          <nav aria-label="Breadcrumbs"><Link className="nav-link" href="/cases/ultra/cart">Back</Link></nav>
          <div>
            Items: <strong id="count">{qty}</strong>
          </div>
        </div>
      </header>
      <main className="container">
        <section className="card" aria-label="Checkout">
          <h1 className="text-2xl font-semibold">Checkout</h1>
          <div className="row" role="radiogroup" aria-label="Payment method">
            <label className="block">
              <input type="radio" name="pm" value="card" checked={pm === "card"} onChange={() => setPm("card")} /> Card
            </label>
            <label className="block">
              <input type="radio" name="pm" value="invoice" checked={pm === "invoice"} onChange={() => setPm("invoice")} /> Invoice
            </label>
          </div>
          <div className="row">
            <label htmlFor="name" className="label">Name on card</label>
            <input id="name" className="input" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="row">
            <label htmlFor="cc" className="label">Card number</label>
            <input id="cc" className="input" type="text" value={cc} onChange={(e) => setCc(e.target.value)} />
          </div>
          <div className="row">
            <label>
              <input id="confirm" type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> Confirm purchase
            </label>
          </div>
          <div className="row">
            <button id="pay" className="btn btn-primary" disabled={!ok} onClick={() => ok && router.push("/cases/success")}>Pay now</button>
          </div>
        </section>
      </main>
    </div>
  );
}
