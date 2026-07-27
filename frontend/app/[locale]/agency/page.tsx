import { Suspense } from "react";

import AgencyDashboard from "../../../features/agency/AgencyDashboard";

export default function AgencyPage() {
  return (
    <Suspense fallback={null}>
      <AgencyDashboard />
    </Suspense>
  );
}
