import { AdminMessages } from "./AdminMessages";

export const dynamic = "force-dynamic";

export default function AdminMessagesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Messages
        </h1>
        <p className="text-sm text-muted-foreground">
          Conversations with residents — problem reports and questions.
        </p>
      </div>
      <AdminMessages />
    </div>
  );
}
