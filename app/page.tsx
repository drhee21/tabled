import { CreateSessionForm } from "./create-session-form";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <h1 className="text-3xl font-bold">Tabled</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">
        Start a session, share the link, and pick a place together.
      </p>
      <CreateSessionForm />
    </main>
  );
}
