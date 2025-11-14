"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

export default function LlmFormStartPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = searchParams.get("task");

  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!answer.trim()) {
      setStatus("Please enter an answer before submitting.");
      return;
    }
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer, taskId }),
      });
      if (!res.ok) {
        setStatus("There was a problem grading your answer. Please try again.");
        return;
      }
      const data = (await res.json()) as { ok?: boolean };
      if (data.ok) {
        router.push("/cases/success");
      } else {
        setStatus("That answer was not accepted. Review the information and try again.");
      }
    } catch (err) {
      console.error("Submit error", err);
      setStatus("Unexpected error submitting your answer.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <main className="container">
        <div className="card max-w-3xl">
          <h1 className="text-3xl font-semibold">Submit your answer</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">
            Complete your task using the rest of the application, then return to this page and submit
            your final answer in the form below.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4" aria-label="Task answer form">
            <div>
              <label htmlFor="answer" className="label">
                Final answer
              </label>
              <textarea
                id="answer"
                className="input"
                rows={3}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type your final answer here"
              />
            </div>
            <div className="row">
              <button id="submit" type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit answer"}
              </button>
            </div>
            {status && (
              <p id="status" role="status" aria-live="polite" className="text-sm text-red-700">
                {status}
              </p>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}
