/** Small inline loading spinner; inherits the text color. */
export function Spinner({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}
