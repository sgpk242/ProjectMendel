export type TopicItem = { id: string; name: string; relevanceScore: number | null };

/** Topic pills for the detail page, each showing the classifier's relevance
 * score and ordered by it descending. */
export function TopicList({ topics }: { topics: TopicItem[] }) {
  if (topics.length === 0) return null;

  const sorted = [...topics].sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));

  return (
    <div className="flex flex-wrap gap-2">
      {sorted.map((topic) => (
        <span
          key={topic.id}
          className="flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-sm text-accent"
        >
          {topic.name}
          {topic.relevanceScore !== null ? (
            <span className="text-xs text-accent/70">
              {Math.round(topic.relevanceScore * 100)}%
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}
