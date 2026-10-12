import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";
import { AnimationStudio } from "@/components/skill-animation";

export const metadata: Metadata = { title: "3D animations" };

export default function AnimatePage() {
  return (
    <Container>
      <PageHeader
        eyebrow="3D animations"
        title="Skill animations"
        description="Watch skills in 3D, step through each phase, type FIG notation to see any twisting somersault — such as 822o, a fliffis with a full twist in each somersault — or chain skills into a combination."
      />
      <div className="mt-6">
        <AnimationStudio />
      </div>
    </Container>
  );
}
