"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function ExamPage() {
  const router = useRouter();
  const [q1, setQ1] = useState<string | null>(null);
  const [q2, setQ2] = useState<string[]>([]);
  const [q3, setQ3] = useState<string[]>([]);
  const [q4, setQ4] = useState("");
  const [q5, setQ5] = useState("");

  const isComplete = useMemo(() => {
    return (
      q1 !== null && q2.length > 0 && q3.length > 0 && q4.trim() !== "" && q5.trim() !== ""
    );
  }, [q1, q2, q3, q4, q5]);

  function toggleMany(setter: (v: string[]) => void, current: string[], value: string) {
    if (current.includes(value)) setter(current.filter((v) => v !== value));
    else setter([...current, value]);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isComplete) return;
    let score = 0;
    if (q1 === "4") score += 1;
    const q2Correct = new Set(["2", "3", "5"]);
    const q2All = ["2", "3", "4", "5"];
    const q2Ok = q2All.every((v) => q2Correct.has(v) === q2.includes(v));
    if (q2Ok) score += 1;
    const q3Correct = new Set(["2", "4"]);
    const q3All = ["1", "2", "3", "4"];
    const q3Ok = q3All.every((v) => q3Correct.has(v) === q3.includes(v));
    if (q3Ok) score += 1;
    if (q4.trim() === "12") score += 1;
    if (q5.trim() === "9") score += 1;
    router.push(`/cases/success?score=${score}&total=5`);
  }

  const labelStyle = { display: "block", margin: "0.25rem 0" } as const;
  const rowStyle = { margin: "1rem 0" } as const;
  const mainStyle = { maxWidth: 820, margin: "2rem auto", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" } as const;

  return (
    <main style={mainStyle}>
      <h1>Exam</h1>
      <form onSubmit={onSubmit} aria-label="Exam form">
        <fieldset>
          <legend>1) 2 + 2 = ?</legend>
          <label style={labelStyle}><input type="radio" name="q1" value="3" checked={q1 === "3"} onChange={() => setQ1("3")} />3</label>
          <label style={labelStyle}><input type="radio" name="q1" value="4" checked={q1 === "4"} onChange={() => setQ1("4")} />4</label>
          <label style={labelStyle}><input type="radio" name="q1" value="5" checked={q1 === "5"} onChange={() => setQ1("5")} />5</label>
        </fieldset>

        <fieldset>
          <legend>2) Select all prime numbers</legend>
          {(["2","3","4","5"] as const).map((v) => (
            <label key={v} style={labelStyle}>
              <input type="checkbox" name="q2" value={v} checked={q2.includes(v)} onChange={() => toggleMany(setQ2, q2, v)} />{v}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>3) Select all even numbers</legend>
          {(["1","2","3","4"] as const).map((v) => (
            <label key={v} style={labelStyle}>
              <input type="checkbox" name="q3" value={v} checked={q3.includes(v)} onChange={() => toggleMany(setQ3, q3, v)} />{v}
            </label>
          ))}
        </fieldset>

        <div style={rowStyle}>
          <label htmlFor="q4">4) 5 + 7 =</label>
          <input id="q4" name="q4" type="text" value={q4} onChange={(e) => setQ4(e.target.value)} />
        </div>

        <div style={rowStyle}>
          <label htmlFor="q5">5) √81 =</label>
          <input id="q5" name="q5" type="text" value={q5} onChange={(e) => setQ5(e.target.value)} />
        </div>

        <div style={rowStyle}>
          <button id="submit" type="submit" disabled={!isComplete}>Submit</button>
        </div>
      </form>
    </main>
  );
}

