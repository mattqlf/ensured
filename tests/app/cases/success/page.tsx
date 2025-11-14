"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function SuccessPage() {
  const params = useSearchParams();
  const score = params.get("score");
  const total = params.get("total");
  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <h1>success</h1>
      {score && total ? (
        <p id="score">Score: {score} / {total}</p>
      ) : null}
      <p>
        <Link href="/cases/test-page">Back</Link>
      </p>
    </main>
  );
}

