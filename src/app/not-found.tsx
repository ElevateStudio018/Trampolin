import { Container, EmptyState, LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <Container className="py-16">
      <EmptyState title="Page not found" action={<LinkButton href="/tricks">Browse the Trick Book</LinkButton>}>
        It may have been moved, made private or never existed.
      </EmptyState>
    </Container>
  );
}
