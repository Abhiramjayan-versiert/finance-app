"use client";

import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";

export default function AppError({ reset, error }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="py-10">
      <ErrorState
        title="We couldn't load this page"
        description={`Your data is safe. Please try again.${error.digest ? ` (ref: ${error.digest})` : ""}`}
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
