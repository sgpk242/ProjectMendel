import { QuickRating } from '@/components/dashboard/quick-rating';

/** Larger, labeled version of the dashboard's rating control, for the detail page. */
export function RatingEditor({ sourceId, rating }: { sourceId: string; rating: number | null }) {
  return <QuickRating sourceId={sourceId} rating={rating} showLabels />;
}
