"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <nav className="bg-white shadow dark:bg-gray-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-800 dark:text-white">
                Ensured Dashboard
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {user.email}
              </span>
              <button
                onClick={signOut}
                className="text-sm text-red-600 hover:text-red-800 dark:text-red-400"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl space-y-8 py-6 sm:px-6 lg:px-8">
        {/* Test Cases Section */}
        <section className="px-4 sm:px-0">
          <h2 className="mb-4 text-lg font-medium leading-6 text-gray-900 dark:text-white">
            Test Cases
          </h2>

          {testCasesError && (
            <div className="mb-4 rounded-lg bg-red-100 p-4 text-red-700 dark:bg-red-200 dark:text-red-800">
              Error: {testCasesError}
            </div>
          )}

          {testCases && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {Array.isArray(testCases) &&
                testCases.map((tc: any, idx: number) => (
                  <div
                    key={idx}
                    className="overflow-hidden rounded-lg bg-white p-5 shadow dark:bg-gray-800"
                  >
                    <div
                      className="truncate font-medium text-gray-900 dark:text-white"
                      title={tc.starting_url}
                    >
                      {tc.starting_url}
                    </div>
                    <p className="mt-1 line-clamp-3 text-sm text-gray-500 dark:text-gray-400">
                      {tc.task_prompt}
                    </p>
                  </div>
                ))}
            </div>
          )}
        </section>

        {/* Recent Runs Section */}
        <section className="px-4 sm:px-0">
          <h2 className="mb-4 text-lg font-medium leading-6 text-gray-900 dark:text-white">
            Recent Runs
          </h2>

          {runsError && (
            <div className="mb-4 rounded-lg bg-red-100 p-4 text-red-700 dark:bg-red-200 dark:text-red-800">
              Error: {runsError}
            </div>
          )}

          {!runs && !runsError && <p>Loading runs...</p>}

          {runs && runs.length === 0 && (
            <p className="text-gray-500">No runs found yet.</p>
          )}

          {runs && runs.length > 0 && (
            <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-800">
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {runs.map((run: any) => (
                  <li
                    key={run.run_id}
                    className={`cursor-pointer px-4 py-4 sm:px-6 transition hover:bg-gray-50 dark:hover:bg-gray-700 ${
                      selectedRun && selectedRun.run_id === run.run_id
                        ? "bg-gray-100 dark:bg-gray-700"
                        : ""
                    }`}
                    onClick={() => {
                      setSelectedRun(run);
                      setIsTranscriptOpen(true);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="max-w-lg truncate">
                        <p className="truncate text-sm font-medium text-blue-600 dark:text-blue-400">
                          {run.url}
                        </p>
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {run.prompt}
                        </p>
                      </div>
                      <div className="ml-2 flex flex-shrink-0">
                        <span
                          className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                            run.status === "success"
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              : run.status === "failure"
                              ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                              : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                          }`}
                        >
                          {run.status}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 sm:flex sm:justify-between">
                      <div className="sm:flex">
                        <p className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                          {run.timestamp
                            ? new Date(run.timestamp).toLocaleString()
                            : ""}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </main>

      {/* Run Detail Sidebar */}
      {selectedRun && (
        <aside
          className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-xl transform flex-col border-l border-gray-200 bg-white shadow-xl transition-transform dark:border-gray-700 dark:bg-gray-900 ${
            isTranscriptOpen ? "translate-x-0" : "translate-x-full"
          }`}
          aria-labelledby="run-details-title"
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <div>
              <h2
                id="run-details-title"
                className="text-base font-semibold text-gray-900 dark:text-white"
              >
                Run Details
              </h2>
              <p className="line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                {selectedRun.url}
              </p>
            </div>
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              onClick={() => setIsTranscriptOpen(false)}
            >
              Hide
            </button>
          </div>

          <div className="border-b border-gray-200 px-4 py-3 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">
            <p className="mb-1">
              <strong>Prompt:</strong> {selectedRun.prompt}
            </p>
            <p className="mb-1">
              <strong>Status:</strong>{" "}
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                  selectedRun.status === "success"
                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    : selectedRun.status === "failure"
                    ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                    : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                }`}
              >
                {selectedRun.status}
              </span>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {selectedRun.timestamp
                ? new Date(selectedRun.timestamp).toLocaleString()
                : ""}
            </p>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Agent Trace
            </h3>

            {!selectedRun.transcript ||
              (Array.isArray(selectedRun.transcript) &&
                selectedRun.transcript.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No agent trace available yet for this run.
                  </p>
                ))}

            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {Array.isArray(selectedRun.transcript) &&
              selectedRun.transcript.map((step: any, idx: number) => (
                <div
                  key={idx}
                  className={`rounded-lg border p-3 text-sm ${
                    step.role === "user"
                      ? "border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30"
                      : step.role === "tool"
                      ? "border-gray-200 bg-gray-50 font-mono text-xs dark:border-gray-600 dark:bg-gray-700/50"
                      : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
                  }`}
                >
                  <div className="mb-1 font-semibold capitalize text-gray-700 dark:text-gray-300">
                    {step.role} {step.name ? `(${step.name})` : ""}
                  </div>
                  <div className="whitespace-pre-wrap break-words text-gray-800 dark:text-gray-200">
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
                                className="mt-2 max-w-full rounded border shadow-sm"
                              />
                            )}
                            {typeof part === "string" && renderStructuredText(part)}
                            {/* Fallback for unknown parts in array */}
                            {!part.type &&
                              typeof part !== "string" && (
                                <pre className="mt-1 text-xs text-gray-500">
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
                          <pre className="mt-1 text-xs text-gray-500">
                            {JSON.stringify(content, null, 2)}
                          </pre>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  {step.tool_calls && (
                    <div className="mt-2 rounded bg-gray-100 p-2 dark:bg-gray-900">
                      <div className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                        Tool Calls
                      </div>
                      {step.tool_calls.map((tc: any, i: number) => (
                        <div key={i} className="mt-1 font-mono text-xs text-gray-800 dark:text-gray-200">
                          <span className="text-blue-600 dark:text-blue-400">{tc.name}</span>:{" "}
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
