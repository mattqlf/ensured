"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";

const DEFAULT_PROJECT_ID = "default-project";

const formatTimestamp = (value?: string | number | Date) => {
  if (!value) return "";
  try {
    if (typeof value === "object" && "toDate" in value && typeof (value as any).toDate === "function") {
      return (value as any).toDate().toLocaleString();
    }
    const date =
      typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : value;
    return date.toLocaleString();
  } catch {
    return String(value);
  }
};

const statusClass = (status?: string) => {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize border";
  if (status === "success") {
    return `${base} border-emerald-500/30 bg-emerald-500/15 text-emerald-100`;
  }
  if (status === "failure") {
    return `${base} border-rose-500/30 bg-rose-500/15 text-rose-100`;
  }
  return `${base} border-amber-500/30 bg-amber-500/15 text-amber-100`;
};

export default function ProjectsPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  const [runs, setRuns] = useState<any[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);

  // Subscribe to runs for this user
  useEffect(() => {
    if (!user) return;

    const runsRef = collection(db, "users", user.uid, "test_runs");
    const q = query(runsRef, orderBy("timestamp", "desc"), limit(100));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const newRuns = snapshot.docs.map((snap) => {
          const data = snap.data() as any;
          return {
            ...data,
            run_id: data.run_id || snap.id,
          };
        });
        setRuns(newRuns);
      },
      (err) => {
        console.error(err);
        setRunsError(err.message);
      }
    );
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [loading, user, router]);

  const projects = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        repo?: string;
        runCount: number;
        successes: number;
        failures: number;
        latest?: string;
      }
    >();

    (runs || []).forEach((run: any) => {
      const pid = run.project_id || DEFAULT_PROJECT_ID;
      const existing = map.get(pid) || {
        id: pid,
        name: run.project_name || (pid === DEFAULT_PROJECT_ID ? "Default project" : pid),
        repo: run.repo_url || run.project_repo,
        runCount: 0,
        successes: 0,
        failures: 0,
        latest: undefined,
      };
      existing.runCount += 1;
      if (run.status === "success") existing.successes += 1;
      if (run.status === "failure") existing.failures += 1;
      if (!existing.repo && (run.repo_url || run.project_repo)) {
        existing.repo = run.repo_url || run.project_repo;
      }
      if (!existing.latest && run.timestamp) {
        existing.latest = formatTimestamp(run.timestamp);
      }
      map.set(pid, existing);
    });

    if (!map.size) {
      map.set(DEFAULT_PROJECT_ID, {
        id: DEFAULT_PROJECT_ID,
        name: "Default project",
        repo: "",
        runCount: 0,
        successes: 0,
        failures: 0,
        latest: "",
      });
    }

    return Array.from(map.values());
  }, [runs]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f1115] text-white">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1115] text-slate-100">
      <header className="flex items-center justify-between border-b border-[#1f2229] bg-[#0f1115] px-6 py-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Projects</p>
          <h1 className="text-xl font-semibold text-white">Pick a project</h1>
          <p className="text-sm text-slate-400">
            Click a project to drill into test cases, runs, and chat.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-[#1c1f26] px-3 py-1 text-xs font-semibold text-white">
            {user.email}
          </span>
          <button
            onClick={signOut}
            className="rounded-lg border border-[#1f2229] bg-[#16171b] px-4 py-2 text-sm font-semibold text-white transition hover:border-emerald-500/60 hover:bg-emerald-500/10"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-8 px-5 py-10">
        {runsError && (
          <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-rose-100">
            Error loading runs: {runsError}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => router.push(`/dashboard?projectId=${encodeURIComponent(project.id)}`)}
              className="flex flex-col gap-3 rounded-2xl border border-[#1f2229] bg-[#16171b] p-5 text-left shadow-sm transition hover:border-emerald-600/40 hover:bg-[#1a1c21]"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Project</p>
                  <h3 className="text-lg font-semibold text-white">{project.name}</h3>
                  {project.repo && (
                    <a
                      href={project.repo}
                      onClick={(e) => e.stopPropagation()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-400 underline"
                    >
                      {project.repo}
                    </a>
                  )}
                </div>
                <div className="rounded-full bg-[#1c1f26] px-3 py-1 text-xs text-slate-300">
                  {project.runCount} runs
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-200">
                  ✓ {project.successes} success
                </span>
                <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-rose-200">
                  ⚠ {project.failures} fail
                </span>
                {project.latest && <span>Latest {project.latest}</span>}
              </div>
            </button>
          ))}
        </section>

        <section className="rounded-2xl border border-[#1f2229] bg-[#16171b] p-5 shadow">
          <h3 className="text-lg font-semibold text-white">Connect a repository</h3>
          <p className="mt-1 text-sm text-slate-400">
            Run the CLI from your repo to tag runs with a project so they show up here.
          </p>
          <div className="mt-4 space-y-2 rounded-lg border border-[#1f2229] bg-[#0f1115] p-4 text-sm text-slate-200">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Initialize a project</p>
            <code className="block rounded bg-[#121316] px-3 py-2 text-xs">
              python src/test_runner.py --init-project --project-id my-project --project-name "My Project" --repo-url https://github.com/org/repo
            </code>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Run tests locally</p>
            <code className="block rounded bg-[#121316] px-3 py-2 text-xs">
              TEST_BASE_URL=http://localhost:3000 python src/test_runner.py --project-id my-project
            </code>
            <p className="text-xs text-slate-500">
              The CLI stores your token in cli_auth.json and writes ensured.project.json so future runs automatically tag the correct project.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
