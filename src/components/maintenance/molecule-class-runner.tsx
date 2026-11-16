'use client';

import { BatchRunner } from './batch-runner';

/** Classifies compounds with no molecule category, 40 per request. */
export function MoleculeClassRunner({ unclassified }: { unclassified: number }) {
  return (
    <BatchRunner
      endpoint="/api/maintenance/classify-molecules"
      total={unclassified}
      label={(n) => `Classify ${n} compounds`}
      runningLabel="Classifying"
      doneText="Every compound has a molecule category."
    />
  );
}
