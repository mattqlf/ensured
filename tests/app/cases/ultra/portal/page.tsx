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
    <div className="page">
      <header className="app-header">
        <div className="app-header-inner">
          <strong className="text-lg">Portal</strong>
          <nav aria-label="Breadcrumbs"><Link className="nav-link" href="/cases/ultra/start">Back</Link></nav>
          <div></div>
        </div>
      </header>
      <main className="container">
        <div role="tablist" aria-label="Sections" className="tabs">
          <button id="tab-tasks" className="tab" role="tab" aria-selected={tab === "tasks"} aria-controls="panel-tasks" onClick={() => setTab("tasks")}>
            Tasks
          </button>
          <button id="tab-profile" className="tab" role="tab" aria-selected={tab === "profile"} aria-controls="panel-profile" onClick={() => setTab("profile")}>
            Profile
          </button>
        </div>
        <section id="panel-tasks" role="tabpanel" className="panel" aria-labelledby="tab-tasks" hidden={tab !== "tasks"}>
          <h1 className="text-2xl font-semibold">Tasks</h1>
          <div className="row">
            <button id="open-terms" className="btn btn-secondary" onClick={() => setOpen(true)}>
              Open terms
            </button>
          </div>
          <div className="row">
            <label htmlFor="plan" className="label">Plan</label>
            <select id="plan" name="plan" aria-label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)} className="select">
              <option>Basic</option>
              <option>Premium</option>
            </select>
          </div>
          <div className="row">
            <label className="block">
              <input id="notif" type="checkbox" checked={notif} onChange={(e) => setNotif(e.target.checked)} /> Enable notifications
            </label>
            <label className="block">
              <input id="backup" type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} /> Enable backups
            </label>
          </div>
          <div className="row">
            <button id="proceed" className="btn btn-primary" disabled={!proceedOk} onClick={() => proceedOk && router.push("/cases/ultra/cart")}>Proceed</button>
          </div>
        </section>
        <section id="panel-profile" role="tabpanel" className="panel" aria-labelledby="tab-profile" hidden={tab !== "profile"}>
          <h1 className="text-2xl font-semibold">Profile</h1>
          <p>Signed out.</p>
        </section>

        {open && (
          <>
            <div className="dialog-backdrop" />
            <div role="dialog" aria-modal="true" aria-labelledby="terms-title" className="dialog">
              <h2 id="terms-title" className="text-xl font-semibold">Terms</h2>
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">Please accept to continue.</p>
              <div className="row mt-3">
                <button id="accept" className="btn btn-primary" onClick={() => { setAccepted(true); setOpen(false); }}>
                  I accept
                </button>
                <button id="close" className="btn btn-secondary" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
