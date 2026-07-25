export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="mx-auto max-w-lg text-center">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          Clinexa Platform
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
          Internal Management
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          CRM, Admin, Doctor, and Pharmacy workspaces will be role-based sections
          of this Next.js application. Foundation scaffold only — no business
          features yet.
        </p>
      </div>
    </main>
  );
}
