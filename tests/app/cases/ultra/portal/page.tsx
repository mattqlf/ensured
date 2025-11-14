"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function PortalPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"tasks" | "profile">("tasks");
  const [accepted, setAccepted] = useState(false);
  const [plan, setPlan] = useState("Basic");
  const [notif, setNotif] = useState(false);
  const [backup, setBackup] = useState(false);
  const [open, setOpen] = useState(false);
  const proceedOk = accepted && plan === "Premium" && notif && backup;
  useEffect(() => {
    setAccepted(sessionStorage.getItem("accepted") === "true");
  }, []);
  useEffect(() => {
    sessionStorage.setItem("accepted", accepted ? "true" : "false");
  }, [accepted]);

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #ddd" }}>
        <strong>Portal</strong>
        <nav aria-label="Breadcrumbs"><Link href="/cases/ultra/start">Back</Link></nav>
        <div></div>
      </header>
      <main style={{ maxWidth: 960, margin: "24px auto", padding: "0 16px" }}>
        <div role="tablist" aria-label="Sections" className="tabs" style={{ display: "flex", gap: 8, borderBottom: "1px solid #ddd" }}>
          <button id="tab-tasks" className="tab" role="tab" aria-selected={tab === "tasks"} aria-controls="panel-tasks" onClick={() => setTab("tasks")}>
            Tasks
          </button>
          <button id="tab-profile" className="tab" role="tab" aria-selected={tab === "profile"} aria-controls="panel-profile" onClick={() => setTab("profile")}>
            Profile
          </button>
        </div>
        <section id="panel-tasks" role="tabpanel" className="panel" aria-labelledby="tab-tasks" hidden={tab !== "tasks"} style={{ border: "1px solid #ddd", borderTop: "none", borderRadius: "0 0 10px 10px", padding: 16, background: "#fff" }}>
          <h1>Tasks</h1>
          <div className="row" style={{ margin: 12 }}>
            <button id="open-terms" className="btn" onClick={() => setOpen(true)}>
              Open terms
            </button>
          </div>
          <div className="row" style={{ margin: 12 }}>
            <label htmlFor="plan">Plan</label>
            <select id="plan" name="plan" aria-label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option>Basic</option>
              <option>Premium</option>
            </select>
          </div>
          <div className="row" style={{ margin: 12 }}>
            <label style={{ display: "block" }}>
              <input id="notif" type="checkbox" checked={notif} onChange={(e) => setNotif(e.target.checked)} /> Enable notifications
            </label>
            <label style={{ display: "block" }}>
              <input id="backup" type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} /> Enable backups
            </label>
          </div>
          <div className="row" style={{ margin: 12 }}>
            <button id="proceed" className="btn" disabled={!proceedOk} onClick={() => proceedOk && router.push("/cases/ultra/cart")}>
              Proceed
            </button>
          </div>
        </section>
        <section id="panel-profile" role="tabpanel" className="panel" aria-labelledby="tab-profile" hidden={tab !== "profile"} style={{ border: "1px solid #ddd", borderTop: "none", borderRadius: "0 0 10px 10px", padding: 16, background: "#fff" }}>
          <h1>Profile</h1>
          <p>Signed out.</p>
        </section>

        {open && (
          <div role="dialog" aria-modal="true" aria-labelledby="terms-title" style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16, background: "white", position: "fixed", inset: 0, margin: "auto", height: "fit-content", width: 420 }}>
            <h2 id="terms-title">Terms</h2>
            <p>Please accept to continue.</p>
            <div className="row" style={{ display: "flex", gap: 12 }}>
              <button id="accept" className="btn" onClick={() => { setAccepted(true); setOpen(false); }}>
                I accept
              </button>
              <button id="close" className="btn" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

