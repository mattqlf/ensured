"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function SuccessPage() {
  const params = useSearchParams();
  const score = params.get("score");
  const total = params.get("total");
  return (
    <div className="page">
      <main className="container">
        <div className="card">
          <h1 className="text-3xl font-semibold">success</h1>
          {score && total ? (
            <p id="score" className="mt-2 text-zinc-600 dark:text-zinc-400">Score: {score} / {total}</p>
          ) : null}
          <p className="mt-6">
            <Link className="btn btn-outline" href="/cases/test-page">Back</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
