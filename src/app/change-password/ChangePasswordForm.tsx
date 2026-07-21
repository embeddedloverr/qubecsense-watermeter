"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  FieldError,
} from "@/components/ui";
import { IconAlert, IconCheck, IconX } from "@/components/icons";
import { homeFor } from "@/lib/utils";
import {
  passwordChecklist,
  validatePassword,
  PASSWORD_MIN_LENGTH,
} from "@/lib/password";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState("");
  const [fieldError, setFieldError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const checklist = passwordChecklist(next);
  const meetsPolicy = checklist.every((c) => !c.required || c.ok);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldError("");

    const invalid = validatePassword(next);
    if (invalid) {
      setFieldError(invalid);
      return;
    }
    if (next !== confirm) {
      setFieldError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: forced ? undefined : current,
          newPassword: next,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not change password.");
        setLoading(false);
        return;
      }
      router.replace(homeFor(data.role));
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
            >
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!forced && (
            <div>
              <Label htmlFor="current" required>
                Current password
              </Label>
              <Input
                id="current"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
              />
            </div>
          )}

          <div>
            <Label htmlFor="new" required>
              New password
            </Label>
            <div className="relative">
              <Input
                id="new"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
                className="pr-16"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {show ? "Hide" : "Show"}
              </button>
            </div>

            {/* Live policy checklist */}
            <ul className="mt-2.5 space-y-1" aria-live="polite">
              {checklist.map((c) => (
                <li
                  key={c.id}
                  className={`flex items-center gap-1.5 text-xs ${
                    c.ok
                      ? "text-success"
                      : c.required
                        ? "text-muted-foreground"
                        : "text-muted-foreground/70"
                  }`}
                >
                  {c.ok ? (
                    <IconCheck className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <IconX className="h-3.5 w-3.5 shrink-0 opacity-50" />
                  )}
                  <span>{c.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <Label htmlFor="confirm" required>
              Confirm new password
            </Label>
            <Input
              id="confirm"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Re-enter new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            <FieldError>{fieldError}</FieldError>
          </div>

          <Button
            type="submit"
            size="lg"
            loading={loading}
            disabled={!meetsPolicy || !confirm}
            className="w-full"
          >
            {loading ? "Saving…" : "Save new password"}
          </Button>

          <button
            type="button"
            onClick={logout}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
