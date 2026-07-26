import { NewSiteForm } from "./NewSiteForm";

export const dynamic = "force-dynamic";

export default function NewSitePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          New site
        </h1>
        <p className="text-sm text-muted-foreground">
          Add a building. You can add its meter-data credentials now or later.
        </p>
      </div>
      <NewSiteForm />
    </div>
  );
}
