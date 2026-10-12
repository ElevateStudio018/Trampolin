"use client";

import { Container, EmptyState, Button } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Container className="py-16">
      <EmptyState title="Something went wrong" action={<Button onClick={reset}>Try again</Button>}>
        The error has been logged. If it keeps happening, try again later.
      </EmptyState>
    </Container>
  );
}
