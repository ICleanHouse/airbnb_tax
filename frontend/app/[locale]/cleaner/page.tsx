import { Suspense } from "react";

import CleanerDashboard from "../../../features/cleaner/CleanerDashboard";

export default function CleanerPage() {
  return (
    <Suspense fallback={null}>
      <CleanerDashboard />
    </Suspense>
  );
}
