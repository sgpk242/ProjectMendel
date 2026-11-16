'use client';

import { BatchRunner } from './batch-runner';

/** Tags untagged compounds as industrial / pharma / both, 40 per request. */
export function MarketTagRunner({ untagged }: { untagged: number }) {
  return (
    <BatchRunner
      endpoint="/api/maintenance/tag-markets"
      total={untagged}
      label={(n) => `Tag ${n} compounds`}
      runningLabel="Tagging"
      doneText="Every compound has a market tag."
    />
  );
}
