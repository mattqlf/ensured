"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Helper to render the structured <task>, <url>, <ui_manifest>, <context> markup
const renderStructuredText = (text: string) => {
  if (!text || typeof text !== "string") {
    return <span>{text}</span>;
  }

  const hasTags = /<(task|context|url|ui_manifest)>/i.test(text);
  if (!hasTags) {
    return <span>{text}</span>;
  }

  const extractTag = (raw: string, tag: string) => {
    const regex = new RegExp(
      `<${tag}>[\\s\\n]*([\\s\\S]*?)[\\s\\n]*<\\/${tag}>`,
      "i"
    );
    const match = raw.match(regex);
    return match ? match[1].trim() : null;
  };

  const task = extractTag(text, "task");
  const url = extractTag(text, "url");
  const uiManifest = extractTag(text, "ui_manifest");

  // Remove the known tags to compute any leftover free-form text.
  let leftover = text;
  ["task", "url", "ui_manifest"].forEach((tag) => {
    const regex = new RegExp(
      `<${tag}>[\\s\\n]*([\\s\\S]*?)[\\s\\n]*<\\/${tag}>`,
      "gi"
    );
    leftover = leftover.replace(regex, "");
  });
  // Strip any remaining <context> wrapper tags from display.
  leftover = leftover.replace(/<\/?context>/gi, "");
  leftover = leftover.trim();

  return (
    <div className="space-y-2">
      {task && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
            Task
          </div>
          <p className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">
            {task}
          </p>
        </div>
      )}

      {url && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
            URL
          </div>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 break-all text-sm text-blue-600 underline dark:text-blue-400"
          >
            {url}
          </a>
        </div>
      )}

      {uiManifest && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-gray-600 transition-colors dark:text-gray-300">
            UI Manifest
          </summary>
          <pre className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 p-2 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            {uiManifest}
          </pre>
        </details>
      )}

      {leftover && (
        <p className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">
          {leftover}
        </p>
      )}
    </div>
  );
};

const normalizeUrl = (value?: string) => {
  if (!value) return "";
  try {
    const parsed = new URL(value, "http://placeholder");
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return value;
  }
};

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

const DEFAULT_PROJECT_ID = "default-project";

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  // Test cases data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [testCases, setTestCases] = useState<any[] | null>(null);
  const [testCasesError, setTestCasesError] = useState<string | null>(null);

  // Runs data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [runs, setRuns] = useState<any[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);

  // Selected run + sidebar state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedRun, setSelectedRun] = useState<any | null>(null);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState("overview");
  const searchParams = useSearchParams();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [organizations] = useState([
    { id: "org-personal", name: "Personal" },
    { id: "org-team", name: "Team" },
  ]);
  const [projects, setProjects] = useState([
    {
      id: "proj-experiment",
      orgId: "org-personal",
      name: "Experiment",
      repo: "https://github.com/your-org/your-repo",
    },
    {
      id: "proj-staging",
      orgId: "org-personal",
      name: "Staging",
      repo: "https://github.com/your-org/staging-repo",
    },
    {
      id: "proj-alpha",
      orgId: "org-team",
      name: "Alpha",
      repo: "https://github.com/your-team/alpha",
    },
  ]);
  const [selectedOrgId, setSelectedOrgId] = useState("org-personal");
  const [linkRepoUrl, setLinkRepoUrl] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectRepo, setNewProjectRepo] = useState("");

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [user, loading, router]);

  // Load test cases and subscribe to runs
  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      if (!user) return;

      try {
        // Fetch Test Cases
        fetch("/api/test-cases")
          .then((res) => {
            if (!res.ok) throw new Error("Failed to fetch test cases");
            return res.json();
          })
          .then((data) => {
            if (isMounted) setTestCases(Array.isArray(data) ? data : []);
          })
          .catch((err: Error) => {
            if (isMounted) setTestCasesError(err.message);
          });

        // Real-time Listener for Runs
        const runsRef = collection(db, "users", user.uid, "test_runs");
        const q = query(runsRef, orderBy("timestamp", "desc"), limit(50));

        const unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const newRuns = snapshot.docs.map((snap) => {
              const data = snap.data() as any;
              let transcript = data.transcript;

              // Normalise transcript so the UI can always render it safely.
              if (typeof transcript === "string") {
                try {
                  const parsed = JSON.parse(transcript);
                  transcript = parsed;
                } catch {
                  // Leave as string; the renderer will treat it as plain text.
                }
              }

              if (!transcript) {
                transcript = [];
              }

              return {
                ...data,
                run_id: data.run_id || snap.id,
                transcript,
              };
            });

            if (isMounted) {
              setRuns(newRuns);
            }
          },
          (error) => {
            console.error("Firestore Snapshot Error:", error);
            if (isMounted) setRunsError(error.message);
          }
        );

        return unsubscribe;
      } catch (e) {
        console.error(e);
      }
    };

    const cleanupPromise = fetchData();

    return () => {
      isMounted = false;
      if (cleanupPromise && typeof (cleanupPromise as Promise<() => void>).then === "function") {
        (cleanupPromise as Promise<() => void>).then((unsub) => unsub && unsub());
      }
    };
  }, [user]);

  // Keep selectedRun in sync with real-time data
  useEffect(() => {
    if (selectedRun && runs) {
      const updatedRun = runs.find((r: any) => r.run_id === selectedRun.run_id);
      if (updatedRun) {
        if (JSON.stringify(updatedRun) !== JSON.stringify(selectedRun)) {
          setSelectedRun(updatedRun);
        }
      }
    }
  }, [runs, selectedRun]);

  const totalTestCases = Array.isArray(testCases) ? testCases.length : 0;
  const projectOptions = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; repo?: string; runCount: number; successes: number; failures: number }
    >();

    projects.forEach((p) => {
      map.set(p.id, {
        id: p.id,
        name: p.name,
        repo: p.repo,
        runCount: 0,
        successes: 0,
        failures: 0,
      });
    });

    (runs || []).forEach((run: any) => {
      const pid = run.project_id || DEFAULT_PROJECT_ID;
      const existing = map.get(pid) || {
        id: pid,
        name: run.project_name || (pid === DEFAULT_PROJECT_ID ? "Default project" : pid),
        repo: run.repo_url || run.project_repo,
        runCount: 0,
        successes: 0,
        failures: 0,
      };
      existing.runCount += 1;
      if (run.status === "success") existing.successes += 1;
      if (run.status === "failure") existing.failures += 1;
      if (!existing.repo && (run.repo_url || run.project_repo)) {
        existing.repo = run.repo_url || run.project_repo;
      }
      if (!existing.name && run.project_name) {
        existing.name = run.project_name;
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
      });
    }

    return Array.from(map.values());
  }, [projects, runs]);

  useEffect(() => {
    const queryProject = searchParams.get("projectId");
    if (queryProject && projectOptions.find((p) => p.id === queryProject)) {
      setSelectedProjectId(queryProject);
      return;
    }
    if (!selectedProjectId && projectOptions.length > 0) {
      setSelectedProjectId(projectOptions[0].id);
    }
  }, [searchParams, projectOptions, selectedProjectId]);

  const orgProjects = useMemo(
    () => projects.filter((p) => p.orgId === selectedOrgId),
    [projects, selectedOrgId]
  );

  const selectedProject = useMemo(() => {
    if (orgProjects.length === 0) return null;
    const found = orgProjects.find((p) => p.id === selectedProjectId);
    return found ?? orgProjects[0];
  }, [orgProjects, selectedProjectId]);

  useEffect(() => {
    if (selectedProject) {
      setLinkRepoUrl(selectedProject.repo || "");
    } else {
      setLinkRepoUrl("");
    }
  }, [selectedProject]);

  const filteredRuns = useMemo(() => {
    if (!runs) return [];
    const targetId = selectedProject?.id || DEFAULT_PROJECT_ID;
    return runs.filter(
      (r: any) => (r.project_id || DEFAULT_PROJECT_ID) === targetId
    );
  }, [runs, selectedProject]);

  const totalRuns = filteredRuns.length;
  const successfulRuns = filteredRuns.filter((r: any) => r.status === "success").length;
  const failedRuns = filteredRuns.filter((r: any) => r.status === "failure").length;
  const successRate = totalRuns ? Math.round((successfulRuns / totalRuns) * 100) : 0;
  const latestRunTime =
    filteredRuns && filteredRuns[0]?.timestamp ? formatTimestamp(filteredRuns[0].timestamp) : "Awaiting first run";

  const runsByCase = useMemo(() => {
    if (!testCases || !filteredRuns) return {};
    const normalizedCases =
      Array.isArray(testCases) && testCases.length > 0
        ? testCases.map((tc, index) => ({
            key: tc.starting_url ?? String(index),
            normalized: normalizeUrl(tc.starting_url),
          }))
        : [];

    const activeCases = normalizedCases.filter((tc) => tc.normalized);

    return filteredRuns.reduce<Record<string, any[]>>((acc, run: any) => {
      const runUrl = normalizeUrl(run.url);
      const matchedCase = activeCases.find((tc) => runUrl.includes(tc.normalized));
      if (matchedCase) {
        acc[matchedCase.key] = acc[matchedCase.key] || [];
        acc[matchedCase.key].push(run);
      }
      return acc;
    }, {});
  }, [filteredRuns, testCases]);

  const unmatchedRuns = useMemo(() => {
    if (!filteredRuns) return [];
    if (!testCases || testCases.length === 0) return filteredRuns;

    const normalizedCases = testCases
      .map((tc) => normalizeUrl(tc.starting_url))
      .filter(Boolean);
    return filteredRuns.filter((run: any) => {
      const runUrl = normalizeUrl(run.url);
      return !normalizedCases.some((tcUrl) => runUrl.includes(tcUrl));
    });
  }, [filteredRuns, testCases]);

  const isLoadingTestCases = testCases === null && !testCasesError;
  const isReady = !loading && !!user;

  const navSections = [
    {
      title: "Create",
      items: [
        { id: "overview", label: "Overview" },
        { id: "projects", label: "Projects" },
        { id: "test-cases", label: "Test cases" },
      ],
    },
    ...(unmatchedRuns.length > 0
      ? [
          {
            title: "Manage",
            items: [{ id: "extras", label: "Unmatched" }],
          },
        ]
      : []),
  ];

  const handleNavClick = (id: string) => {
    setActiveNav(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleOrgChange = (orgId: string) => {
    setSelectedOrgId(orgId);
    const candidate = projects.find((p) => p.orgId === orgId);
    const newId = candidate ? candidate.id : "";
    setSelectedProjectId(newId);
    const nextUrl = newId ? `/dashboard?projectId=${encodeURIComponent(newId)}` : "/dashboard";
    router.replace(nextUrl);
  };

  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId);
    const nextUrl = projectId ? `/dashboard?projectId=${encodeURIComponent(projectId)}` : "/dashboard";
    router.replace(nextUrl);
  };

  useEffect(() => {
    if (!runs) return;
    setProjects((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]));
      runs.forEach((run: any) => {
        const pid = run.project_id || DEFAULT_PROJECT_ID;
        if (!map.has(pid)) {
          map.set(pid, {
            id: pid,
            orgId: selectedOrgId,
            name: run.project_name || (pid === DEFAULT_PROJECT_ID ? "Default project" : pid),
            repo: run.repo_url || run.project_repo || "",
          });
        } else {
          const existing = map.get(pid)!;
          if (!existing.repo && (run.repo_url || run.project_repo)) {
            map.set(pid, { ...existing, repo: run.repo_url || run.project_repo });
          }
        }
      });
      return Array.from(map.values());
    });
  }, [runs, selectedOrgId]);

  const handleLinkRepo = () => {
    if (!selectedProject || !linkRepoUrl.trim()) return;
    setProjects((prev) =>
      prev.some((p) => p.id === selectedProject.id)
        ? prev.map((p) =>
            p.id === selectedProject.id ? { ...p, repo: linkRepoUrl.trim() } : p
          )
        : [
            ...prev,
            {
              id: selectedProject.id,
              orgId: selectedOrgId,
              name: selectedProject.name,
              repo: linkRepoUrl.trim(),
            },
          ]
    );
  };

  const handleAddProject = () => {
    if (!newProjectName.trim() || !newProjectRepo.trim()) return;
    const newId = `proj-${Date.now()}`;
    setProjects((prev) => [
      ...prev,
      {
        id: newId,
        orgId: selectedOrgId,
        name: newProjectName.trim(),
        repo: newProjectRepo.trim(),
      },
    ]);
    setSelectedProjectId(newId);
    setNewProjectName("");
    setNewProjectRepo("");
  };

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1115] text-slate-100">
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-[250px] min-w-[240px] flex-col border-r border-[#1f2229] bg-[#0f1115] px-5 py-6 md:flex">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1c1f26] text-sm font-semibold text-white">
              E
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Organization</div>
              <div className="text-sm font-semibold text-white">
                {organizations.find((o) => o.id === selectedOrgId)?.name || "Select"}
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <label className="px-2 text-xs uppercase tracking-[0.18em] text-slate-500">
              Switch organization
            </label>
            <select
              value={selectedOrgId}
              onChange={(e) => handleOrgChange(e.target.value)}
              className="w-full rounded-lg border border-[#1f2229] bg-[#121316] px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id} className="bg-[#0f1115]">
                  {org.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 space-y-2">
            <label className="px-2 text-xs uppercase tracking-[0.18em] text-slate-500">
              Project
            </label>
            <select
              value={selectedProject ? selectedProject.id : ""}
              onChange={(e) => handleProjectChange(e.target.value)}
              className="w-full rounded-lg border border-[#1f2229] bg-[#121316] px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
            >
              {orgProjects.map((project) => (
                <option key={project.id} value={project.id} className="bg-[#0f1115]">
                  {project.name}
                </option>
              ))}
              {orgProjects.length === 0 && <option value="">No projects yet</option>}
            </select>
          </div>

          <nav className="mt-8 space-y-6 text-sm font-medium text-slate-200">
            {navSections.map((section) => (
              <div key={section.title} className="space-y-2">
                <p className="px-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                  {section.title}
                </p>
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = activeNav === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleNavClick(item.id)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition ${
                          isActive
                            ? "bg-[#1a1c21] text-white"
                            : "text-slate-300 hover:bg-[#16171b] hover:text-white"
                        }`}
                      >
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1c1f26] text-[10px] text-slate-300">
                          ●
                        </span>
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-auto space-y-3 px-2">
            <div className="rounded-xl border border-[#1f2229] bg-[#121316] px-3 py-2 text-xs text-slate-300">
              <p className="flex items-center gap-2 text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Live
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Production workspace</p>
            </div>
            <button
              onClick={signOut}
              className="w-full rounded-lg border border-[#1f2229] bg-[#16171b] px-3 py-2 text-xs font-semibold text-white transition hover:border-emerald-500/50 hover:bg-emerald-500/10"
            >
              Sign out
            </button>
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-10 border-b border-[#1f2229] bg-[#0f1115]">
            <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedOrgId}
                  onChange={(e) => handleOrgChange(e.target.value)}
                  className="rounded-lg border border-[#1f2229] bg-[#121316] px-3 py-2 text-xs font-semibold text-slate-200 focus:border-emerald-500 focus:outline-none"
                >
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id} className="bg-[#0f1115]">
                      {org.name}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedProject ? selectedProject.id : ""}
                  onChange={(e) => handleProjectChange(e.target.value)}
                  className="rounded-lg border border-[#1f2229] bg-[#121316] px-3 py-2 text-xs font-semibold text-slate-200 focus:border-emerald-500 focus:outline-none"
                >
                  {orgProjects.map((project) => (
                    <option key={project.id} value={project.id} className="bg-[#0f1115]">
                      {project.name}
                    </option>
                  ))}
                  {orgProjects.length === 0 && <option value="">No projects yet</option>}
                </select>
              </div>
              <div className="flex items-center gap-4 text-sm font-semibold">
                <span className="text-white">Dashboard</span>
                <button
                  onClick={signOut}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[#1f2229] bg-[#16171b] text-xs font-semibold text-white hover:border-emerald-500/60 hover:bg-emerald-500/10"
                >
                  ⎋
                </button>
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-6xl space-y-10 px-4 pb-12 pt-10 sm:px-6 lg:px-10">
            <div className="flex justify-end">
              <button
                onClick={() => router.push("/projects")}
                className="rounded-lg border border-[#1f2229] bg-[#16171b] px-4 py-2 text-xs font-semibold text-white transition hover:border-emerald-500/60 hover:bg-emerald-500/10"
              >
                Projects board
              </button>
            </div>

            <section
              id="overview"
              className="rounded-3xl border border-[#1f2229] bg-[#16171b] px-6 py-10 text-center shadow-lg"
            >
              <div className="flex flex-col items-center gap-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1c1f26] text-2xl">
                  💬
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold text-white">Create a QA prompt</h2>
                  <p className="text-sm text-slate-400">
                    Generate or select a test case to start an autonomous run.
                  </p>
                  {selectedProject && (
                    <p className="text-xs text-slate-500">
                      Active project: {selectedProject.name}
                      {selectedProject.repo ? ` · ${selectedProject.repo}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black shadow hover:shadow-md">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-black/20">
                      +
                    </span>
                    Create
                  </button>
                  <div className="flex items-center gap-2 rounded-full border border-[#1f2229] bg-[#0f1115] px-4 py-2 text-sm text-slate-200">
                    <span className="text-slate-500">Generate...</span>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#1f2229] text-xs">
                      ↑
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap justify-center gap-2 text-xs text-slate-200">
                  {["Smoke test", "Checkout flow", "Form flow", "AI answer", "Regression", "Ad-hoc"].map(
                    (tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-[#1f2229] bg-[#1a1c21] px-3 py-1"
                      >
                        {tag}
                      </span>
                    )
                  )}
                </div>
              </div>

              <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-[#1f2229] bg-[#121316] px-4 py-3 text-left">
                  <p className="text-xs text-slate-400">Test cases</p>
                  <p className="mt-1 text-xl font-semibold text-white">{totalTestCases}</p>
                </div>
                <div className="rounded-2xl border border-[#1f2229] bg-[#121316] px-4 py-3 text-left">
                  <p className="text-xs text-slate-400">Total runs</p>
                  <p className="mt-1 text-xl font-semibold text-white">{totalRuns}</p>
                </div>
                <div className="rounded-2xl border border-[#1f2229] bg-[#121316] px-4 py-3 text-left">
                  <p className="text-xs text-slate-400">Success rate</p>
                  <p className="mt-1 text-xl font-semibold text-emerald-300">{successRate}%</p>
                </div>
                <div className="rounded-2xl border border-[#1f2229] bg-[#121316] px-4 py-3 text-left">
                  <p className="text-xs text-slate-400">Latest update</p>
                  <p className="mt-1 text-sm font-medium text-white">{latestRunTime}</p>
                </div>
              </div>
            </section>

            <section id="projects" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">Projects</h3>
                  <p className="text-sm text-slate-400">
                    Select an organization, switch projects, and link repositories to each.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-[#1f2229] bg-[#16171b] p-5 shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        Active project
                      </p>
                      <h4 className="text-lg font-semibold text-white">
                        {selectedProject ? selectedProject.name : "No project"}
                      </h4>
                      <p className="text-xs text-slate-400">
                        {organizations.find((o) => o.id === selectedOrgId)?.name}
                      </p>
                    </div>
                    {selectedProject?.repo && (
                      <a
                        href={selectedProject.repo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-[#1f2229] bg-[#1c1f26] px-3 py-1 text-xs font-semibold text-slate-200 hover:border-emerald-500/50 hover:text-emerald-200"
                      >
                        Open repo
                      </a>
                    )}
                  </div>
                  <div className="mt-4 space-y-2">
                    <label className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Link repository
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        value={linkRepoUrl}
                        onChange={(e) => setLinkRepoUrl(e.target.value)}
                        placeholder="https://github.com/org/repo"
                        className="w-full rounded-lg border border-[#1f2229] bg-[#0f1115] px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
                      />
                      <button
                        onClick={handleLinkRepo}
                        className="rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#1f2229] bg-[#16171b] p-5 shadow space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Projects in {organizations.find((o) => o.id === selectedOrgId)?.name}
                    </p>
                    <div className="mt-2 space-y-2">
                      {orgProjects.length === 0 && (
                        <p className="text-sm text-slate-400">No projects yet.</p>
                      )}
                      {orgProjects.map((project) => (
                        <button
                          key={project.id}
                          onClick={() => handleProjectChange(project.id)}
                          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition ${
                            selectedProject && selectedProject.id === project.id
                              ? "border-emerald-600 bg-emerald-600/10 text-white"
                              : "border-[#1f2229] bg-[#1c1f26] text-slate-200 hover:border-emerald-500/40"
                          }`}
                        >
                          <span>{project.name}</span>
                          <span className="text-xs text-slate-400">{project.repo}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-[#1f2229] pt-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Add project
                    </p>
                    <div className="mt-2 space-y-2">
                      <input
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="Project name"
                        className="w-full rounded-lg border border-[#1f2229] bg-[#0f1115] px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
                      />
                      <input
                        value={newProjectRepo}
                        onChange={(e) => setNewProjectRepo(e.target.value)}
                        placeholder="https://github.com/org/repo"
                        className="w-full rounded-lg border border-[#1f2229] bg-[#0f1115] px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
                      />
                      <button
                        onClick={handleAddProject}
                        className="w-full rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
                      >
                        Save project
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {testCasesError && (
              <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-rose-100">
                Error loading test cases: {testCasesError}
              </div>
            )}

            {runsError && (
              <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-rose-100">
                Error loading runs: {runsError}
              </div>
            )}

            <section id="test-cases" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">Test cases</h3>
                  <p className="text-sm text-slate-400">
                    Dropdown list of test cases with their most recent runs.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {isLoadingTestCases && (
                  <div className="animate-pulse rounded-xl border border-[#1f2229] bg-[#121316] px-5 py-4">
                    <div className="h-4 w-1/3 rounded bg-[#1f2229]" />
                    <div className="mt-3 h-3 w-2/3 rounded bg-[#1f2229]" />
                  </div>
                )}

                {Array.isArray(testCases) && testCases.length === 0 && (
                  <div className="rounded-xl border border-[#1f2229] bg-[#121316] px-5 py-4 text-sm text-slate-300">
                    No test cases found yet.
                  </div>
                )}

                {Array.isArray(testCases) &&
                  testCases.map((tc: any, idx: number) => {
                    const caseKey = tc.starting_url ?? String(idx);
                    const caseRuns = runsByCase[caseKey] || [];
                    const isOpen = expandedCase === caseKey;
                    const latestCaseRun = caseRuns[0];
                    const caseSuccesses = caseRuns.filter((r: any) => r.status === "success").length;
                    const caseFailures = caseRuns.filter((r: any) => r.status === "failure").length;

                    return (
                      <div
                        key={tc.starting_url ?? idx}
                        className="overflow-hidden rounded-xl border border-[#1f2229] bg-[#121316] shadow-sm transition hover:border-emerald-600/30"
                      >
                        <button
                          className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
                          onClick={() => setExpandedCase(isOpen ? null : caseKey)}
                        >
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-[#1c1f26] px-2.5 py-1 text-xs font-semibold text-slate-200">
                                Test {idx + 1}
                              </span>
                              <span className="text-xs text-slate-400">{tc.starting_url}</span>
                            </div>
                            <p className="text-sm font-medium text-white">{tc.task_prompt}</p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-200">
                                ✓ {caseSuccesses} passed
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-1 text-rose-200">
                                ⚠ {caseFailures} failed
                              </span>
                              <span className="truncate">
                                {latestCaseRun
                                  ? `Updated ${formatTimestamp(latestCaseRun.timestamp)}`
                                  : "Awaiting first run"}
                              </span>
                            </div>
                          </div>
                          <div
                            className={`mt-1 h-9 w-9 rounded-full border border-[#1f2229] bg-[#1c1f26] text-slate-300 transition ${
                              isOpen ? "rotate-180" : ""
                            } flex items-center justify-center`}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={1.5}
                              stroke="currentColor"
                              className="h-5 w-5"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                            </svg>
                          </div>
                        </button>

                        {isOpen && (
                          <div className="space-y-2 border-t border-[#1f2229] px-5 pb-5 pt-3">
                            {caseRuns.length === 0 && (
                              <div className="rounded-lg border border-dashed border-[#1f2229] px-4 py-3 text-sm text-slate-300">
                                No runs for this test yet.
                              </div>
                            )}

                            {caseRuns.slice(0, 6).map((run: any) => (
                              <button
                                key={run.run_id}
                                onClick={() => {
                                  setSelectedRun(run);
                                  setIsTranscriptOpen(true);
                                }}
                                className="group flex w-full items-start justify-between gap-3 rounded-lg border border-[#1f2229] bg-[#0f1115] px-4 py-3 text-left transition hover:border-emerald-600/30"
                              >
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={statusClass(run.status)}>{run.status || "pending"}</span>
                                    <span className="text-xs text-slate-400">
                                      {formatTimestamp(run.timestamp)}
                                    </span>
                                  </div>
                                  <p className="text-sm font-medium text-white line-clamp-2">
                                    {run.prompt}
                                  </p>
                                  <p className="text-xs text-slate-400 line-clamp-1">
                                    {run.url}
                                  </p>
                                </div>
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1c1f26] text-slate-300 transition group-hover:bg-emerald-500/20 group-hover:text-emerald-100">
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={1.5}
                                    stroke="currentColor"
                                    className="h-4 w-4"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
                                  </svg>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </section>

            {unmatchedRuns.length > 0 && (
              <section id="extras" className="space-y-3">
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold text-white">Unmatched runs</h3>
                  <p className="text-sm text-slate-400">Runs without a matching test case.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {unmatchedRuns.slice(0, 6).map((run: any) => (
                    <button
                      key={run.run_id}
                      onClick={() => {
                        setSelectedRun(run);
                        setIsTranscriptOpen(true);
                      }}
                      className="flex flex-col gap-2 rounded-xl border border-[#1f2229] bg-[#121316] px-4 py-3 text-left shadow-sm transition hover:border-emerald-600/30"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={statusClass(run.status)}>{run.status || "pending"}</span>
                        <span className="text-xs text-slate-400">
                          {formatTimestamp(run.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-white line-clamp-2">
                        {run.prompt}
                      </p>
                      <p className="text-xs text-slate-400 line-clamp-1">{run.url}</p>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </main>
        </div>
      </div>

      {/* Run Detail Sidebar */}
      {selectedRun && (
        <aside
          className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-xl transform flex-col border-l border-[#1f2229] bg-[#0f1115] shadow-xl transition-transform ${
            isTranscriptOpen ? "translate-x-0" : "translate-x-full"
          }`}
          aria-labelledby="run-details-title"
        >
          <div className="flex items-center justify-between border-b border-[#1f2229] px-5 py-4">
            <div className="space-y-1">
              <h2
                id="run-details-title"
                className="text-base font-semibold text-white"
              >
                Run details
              </h2>
              <p className="line-clamp-1 text-xs text-slate-400">
                {selectedRun.url}
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-[#1f2229] bg-[#1c1f26] px-3 py-1 text-xs font-semibold text-white transition hover:border-emerald-500/50 hover:bg-emerald-500/10"
              onClick={() => setIsTranscriptOpen(false)}
            >
              Hide
            </button>
          </div>

          <div className="border-b border-[#1f2229] px-5 py-4 text-sm text-slate-200">
            <p className="mb-2">
              <span className="font-semibold">Prompt:</span> {selectedRun.prompt}
            </p>
            <p className="mb-1">
              <span className="font-semibold">Status:</span>{" "}
              <span className={statusClass(selectedRun.status)}>{selectedRun.status || "pending"}</span>
            </p>
            <p className="text-xs text-slate-400">
              {formatTimestamp(selectedRun.timestamp)}
            </p>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                Agent trace
              </h3>
              <span className="text-xs text-slate-400">
              {selectedRun.transcript?.length ?? 0} steps
            </span>
          </div>

            {!selectedRun.transcript ||
              (Array.isArray(selectedRun.transcript) &&
                selectedRun.transcript.length === 0 && (
                  <p className="text-sm text-slate-400">
                    No agent trace available yet for this run.
                  </p>
                ))}

            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {Array.isArray(selectedRun.transcript) &&
              selectedRun.transcript.map((step: any, idx: number) => (
                <div
                  key={idx}
                  className={`rounded-xl border border-[#1f2229] p-3 text-sm shadow-sm ${
                    step.role === "user"
                      ? "bg-emerald-500/5"
                      : step.role === "tool"
                      ? "bg-[#121316] font-mono text-xs"
                      : "bg-[#121316]"
                  }`}
                >
                  <div className="mb-1 font-semibold capitalize text-slate-100">
                    {step.role} {step.name ? `(${step.name})` : ""}
                  </div>
                  <div className="whitespace-pre-wrap break-words text-slate-100">
                    {(() => {
                      const content = step.content;
                      if (Array.isArray(content)) {
                        return content.map((part: any, i: number) => (
                          <div key={i}>
                            {part.type === "text" && renderStructuredText(part.text)}
                            {part.type === "image" && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={
                                  part.url ||
                                  `data:${
                                    part.mime_type || "image/png"
                                  };base64,${part.base64}`
                                }
                                alt="Screenshot"
                                className="mt-2 max-w-full rounded border border-white/10 shadow-sm"
                              />
                            )}
                            {typeof part === "string" && renderStructuredText(part)}
                            {/* Fallback for unknown parts in array */}
                            {!part.type &&
                              typeof part !== "string" && (
                                <pre className="mt-1 text-xs text-slate-400">
                                  {JSON.stringify(part, null, 2)}
                                </pre>
                              )}
                          </div>
                        ));
                      } else if (typeof content === "string") {
                        return renderStructuredText(content);
                      } else if (content && typeof content === "object") {
                        // Safety net for object content
                        return (
                          <pre className="mt-1 text-xs text-slate-400">
                            {JSON.stringify(content, null, 2)}
                          </pre>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  {step.tool_calls && (
                    <div className="mt-2 rounded bg-[#121316] p-2">
                      <div className="text-xs font-semibold uppercase text-slate-300">
                        Tool Calls
                      </div>
                      {step.tool_calls.map((tc: any, i: number) => (
                        <div
                          key={i}
                          className="mt-1 font-mono text-xs text-slate-100"
                        >
                          <span className="text-emerald-200">{tc.name}</span>:{" "}
                          {JSON.stringify(tc.args)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </aside>
      )}
    </div>
  );
}
