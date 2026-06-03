import { Suspense } from "react";

import HostDashboard from "../../features/host/HostDashboard";

export default function HostPage() {
  return (
    <Suspense fallback={null}>
      <HostDashboard />
    </Suspense>
  );
}
