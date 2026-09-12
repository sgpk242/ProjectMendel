type MetadataPanelProps = {
  author: string | null;
  publication: string | null;
  publishedDate: string | null;
  capturedAt: string;
  wordCount: number | null;
  readingTimeMinutes: number | null;
};

/** Full metadata row for the source detail page — everything about the
 * source except its editable fields (status/rating/type/note, handled by
 * their own editor components) and its content (summary/topics/similar
 * sources). */
export function MetadataPanel({
  author,
  publication,
  publishedDate,
  capturedAt,
  wordCount,
  readingTimeMinutes,
}: MetadataPanelProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      {author ? <span>By {author}</span> : null}
      {publication ? <span>{publication}</span> : null}
      {publishedDate ? (
        <span>Published {new Date(publishedDate).toLocaleDateString()}</span>
      ) : null}
      <span>Captured {new Date(capturedAt).toLocaleDateString()}</span>
      {wordCount ? <span>{wordCount.toLocaleString()} words</span> : null}
      {readingTimeMinutes ? <span>{readingTimeMinutes} min read</span> : null}
    </div>
  );
}
