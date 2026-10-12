import { Container, EmptyState, LinkButton } from "@/components/ui";

export default function Forbidden() {
  return (
    <Container className="py-16">
      <EmptyState title="You don't have access to this page" action={<LinkButton href="/">Go home</LinkButton>}>
        This area is limited to reviewers or administrators.
      </EmptyState>
    </Container>
  );
}
