import Link from "next/link";

const cases = [
  {
    id: "exam",
    title: "Exam Suite",
    description: "Standard examination test cases for general capability assessment.",
    href: "/cases/exam",
    color: "bg-blue-500",
  },
  {
    id: "hard",
    title: "Hard Cases",
    description: "Edge cases and complex scenarios designed to break your agent.",
    href: "/cases/hard/start",
    color: "bg-red-500",
  },
  {
    id: "llm-form",
    title: "LLM Form Filling",
    description: "Tests regarding form completion and structured data entry.",
    href: "/cases/llm-form/start",
    color: "bg-purple-500",
  },
  {
    id: "ultra",
    title: "Ultra Suite",
    description: "High-performance benchmarks for advanced autonomous agents.",
    href: "/cases/ultra/start",
    color: "bg-indigo-500",
  },
  {
    id: "test-page",
    title: "Test Page A",
    description: "Basic connectivity and interaction test page.",
    href: "/cases/test-page",
    color: "bg-emerald-500",
  },
  {
    id: "test-page2",
    title: "Test Page B",
    description: "Secondary interaction patterns and navigation tests.",
    href: "/cases/test-page2",
    color: "bg-cyan-500",
  },
];

export default function Dashboard() {
  return (
    <div className="container mx-auto px-4 py-8 space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Select a test suite to begin evaluation.
          </p>
        </div>
        <div className="flex items-center gap-2">
           <button className="inline-flex h-9 items-center justify-center rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground shadow-sm hover:bg-secondary/80">
             Filter
           </button>
           <button className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90">
             New Run
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cases.map((c) => (
          <Link
            key={c.id}
            href={c.href}
            className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 transition-all hover:shadow-lg hover:border-primary/50"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`h-10 w-10 rounded-lg ${c.color} opacity-10 group-hover:opacity-20 transition-opacity flex items-center justify-center`}>
                  <div className={`h-4 w-4 rounded-full ${c.color} opacity-50`}></div>
              </div>
              <span className="text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors">
                Ready
              </span>
            </div>
            <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">
              {c.title}
            </h3>
            <p className="text-sm text-muted-foreground">
              {c.description}
            </p>
            <div className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </Link>
        ))}
      </div>
    </div>
  );
}