import { PageLayout } from "@/components/ui/PageLayout";
import { CreateSessionForm } from "./create-session-form";

export default function Home() {
  return (
    <PageLayout>
      <h1 className="text-4xl font-extrabold leading-tight tracking-tight">
        Where should we eat?
      </h1>
      <p className="mt-3 text-lg text-ink-soft">
        Start a session, share the link, and pick a place together.
      </p>
      <CreateSessionForm />
    </PageLayout>
  );
}
