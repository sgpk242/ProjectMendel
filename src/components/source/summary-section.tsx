/** The classifier's LLM-generated summary, shown as prose. */
export function SummarySection({ summary }: { summary: string | null }) {
  if (!summary) return null;

  return (
    <div>
      <h2 className="text-sm font-semibold tracking-tight text-muted">Summary</h2>
      <p className="mt-2 text-sm leading-relaxed text-foreground">{summary}</p>
    </div>
  );
}
