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
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #ddd" }}>
        <strong>Payment</strong>
        <nav aria-label="Breadcrumbs"><Link href="/cases/ultra/cart">Back</Link></nav>
        <div>
          Items: <strong id="count">{qty}</strong>
        </div>
      </header>
      <main style={{ maxWidth: 760, margin: "24px auto", padding: "0 16px" }}>
        <section className="card" aria-label="Checkout" style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16, background: "#fff" }}>
          <h1>Checkout</h1>
          <div className="row" role="radiogroup" aria-label="Payment method" style={{ margin: 10 }}>
            <label style={{ display: "block", margin: "4px 0" }}>
              <input type="radio" name="pm" value="card" checked={pm === "card"} onChange={() => setPm("card")} /> Card
            </label>
            <label style={{ display: "block", margin: "4px 0" }}>
              <input type="radio" name="pm" value="invoice" checked={pm === "invoice"} onChange={() => setPm("invoice")} /> Invoice
            </label>
          </div>
          <div className="row" style={{ margin: 10 }}>
            <label htmlFor="name">Name on card</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="row" style={{ margin: 10 }}>
            <label htmlFor="cc">Card number</label>
            <input id="cc" type="text" value={cc} onChange={(e) => setCc(e.target.value)} />
          </div>
          <div className="row" style={{ margin: 10 }}>
            <label>
              <input id="confirm" type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> Confirm purchase
            </label>
          </div>
          <div className="row" style={{ margin: 10 }}>
            <button id="pay" className="btn" disabled={!ok} onClick={() => ok && router.push("/cases/success")}>Pay now</button>
          </div>
        </section>
      </main>
    </div>
  );
}

