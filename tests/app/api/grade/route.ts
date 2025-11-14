import OpenAI from "openai";
import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type LlmSpec = {
  answer: string;
};

type GradeRequest = {
  answer: string;
  taskId: string;
};

let LLM_SPECS: Record<string, LlmSpec> = {};

function loadSpecs() {
  try {
    const filePath = path.join(process.cwd(), "llm_tests.json");
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, LlmSpec>;
    LLM_SPECS = parsed;
  } catch (err) {
    console.warn("Failed to load llm_tests.json", err);
    LLM_SPECS = {};
  }
}

loadSpecs();

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<GradeRequest>;
    const answer = typeof body.answer === "string" ? body.answer.trim() : "";
    const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";

    if (!answer || !taskId) {
      return NextResponse.json({ error: "Missing answer or taskId" }, { status: 400 });
    }

    const spec = LLM_SPECS[taskId];
    const correct = spec?.answer?.trim();
    if (!correct) {
      return NextResponse.json({ error: "Unknown taskId" }, { status: 400 });
    }

    const prompt = [
      "You are grading a short free-text answer.",
      "Decide whether the student's answer is semantically equivalent to the correct reference answer.",
      "Only minor differences in wording or formatting are allowed.",
      "Respond with a single JSON object like: {\"ok\": true} or {\"ok\": false}.",
      "",
      `Correct reference answer: ${correct}`,
      `Student answer: ${answer}`,
    ].join("\n");

    const response = await client.responses.create({
      model: "gpt-5.1",
      input: prompt,
    });

    // Try to pull the first text output from the response
    let text = "";
    try {
      const firstOutput = (response as any).output?.[0];
      const firstContent = firstOutput?.content?.[0];
      if (firstContent?.type === "output_text" && typeof firstContent.text === "string") {
        text = firstContent.text;
      } else if (typeof firstContent?.text === "string") {
        text = firstContent.text;
      }
    } catch {
      // Fallback: best-effort JSON.stringify for debugging
      text = JSON.stringify(response);
    }

    let ok = false;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed.ok === "boolean") {
        ok = parsed.ok;
      }
    } catch {
      const lower = text.toLowerCase();
      if (lower.includes("ok") && lower.includes("true")) {
        ok = true;
      } else if (lower.includes("correct") && !lower.includes("incorrect")) {
        ok = true;
      }
    }

    return NextResponse.json({ ok });
  } catch (error) {
    console.error("Error grading answer", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

