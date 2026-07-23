"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, CardContent, Input, Label } from "@/components/ui";
import { IconAlert } from "@/components/icons";
import { homeFor } from "@/lib/utils";

type Mode = "password" | "otp";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = React.useState<Mode>("password");
  const [error, setError] = React.useState("");

  const goHome = (role: string) => {
    const from = params.get("from");
    const dest =
      from && !from.startsWith("/login") ? from : homeFor(role);
    router.replace(dest);
    router.refresh();
  };

  return (
    <Card>
      <CardContent className="pt-5">
        {/* Method switch */}
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(["password", "otp"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError("");
              }}
              className={`rounded-md py-2 text-sm font-medium transition-colors ${
                mode === m
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "password" ? "Password" : "Email code"}
            </button>
          ))}
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
          >
            <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {mode === "password" ? (
          <PasswordForm setError={setError} onSuccess={goHome} />
        ) : (
          <OtpForm setError={setError} onSuccess={goHome} />
        )}
      </CardContent>
    </Card>
  );
}

/* --------------------------------- Password -------------------------------- */

function PasswordForm({
  setError,
  onSuccess,
}: {
  setError: (s: string) => void;
  onSuccess: (role: string) => void;
}) {
  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed.");
        setLoading(false);
        return;
      }
      onSuccess(data.user.role);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="identifier" required>
          Email or username
        </Label>
        <Input
          id="identifier"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@qubecsense.com or rosalyn_501"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
      </div>

      <div>
        <Label htmlFor="password" required>
          Password
        </Label>
        <div className="relative">
          <Input
            id="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
      </div>

      <Button type="submit" size="lg" loading={loading} className="w-full">
        {loading ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        First time here? Use <strong>Email code</strong> — no password needed.
      </p>
    </form>
  );
}

/* ----------------------------------- OTP ----------------------------------- */

function OtpForm({
  setError,
  onSuccess,
}: {
  setError: (s: string) => void;
  onSuccess: (role: string) => void;
}) {
  const [step, setStep] = React.useState<"request" | "verify">("request");
  const [identifier, setIdentifier] = React.useState("");
  const [code, setCode] = React.useState("");
  const [maskedEmail, setMaskedEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [resendIn, setResendIn] = React.useState(0);

  React.useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const requestCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 429) {
        setError(data.error || "Could not send the code.");
        setLoading(false);
        return;
      }
      setMaskedEmail(data.email || "");
      setStep("verify");
      setResendIn(60);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, otp: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid code.");
        setLoading(false);
        return;
      }
      onSuccess(data.user.role);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  if (step === "request") {
    return (
      <form onSubmit={requestCode} className="space-y-4">
        <div>
          <Label htmlFor="otp-id" required>
            Email or username
          </Label>
          <Input
            id="otp-id"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com or rosalyn_501"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
        </div>
        <Button type="submit" size="lg" loading={loading} className="w-full">
          {loading ? "Sending…" : "Email me a code"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          We&apos;ll send a 6-digit code to the email on file for your flat.
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={verifyCode} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        We sent a 6-digit code to{" "}
        <strong className="text-foreground">{maskedEmail || "your email"}</strong>
        . Enter it below.
      </p>
      <div>
        <Label htmlFor="otp-code" required>
          Login code
        </Label>
        <Input
          id="otp-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="text-center text-2xl tracking-[0.4em]"
          required
          autoFocus
        />
      </div>
      <Button
        type="submit"
        size="lg"
        loading={loading}
        disabled={code.length !== 6}
        className="w-full"
      >
        {loading ? "Verifying…" : "Verify & sign in"}
      </Button>
      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => {
            setStep("request");
            setCode("");
            setError("");
          }}
          className="font-medium text-muted-foreground hover:text-foreground"
        >
          ← Use a different account
        </button>
        <button
          type="button"
          disabled={resendIn > 0 || loading}
          onClick={() => requestCode()}
          className="font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
        >
          {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
        </button>
      </div>
    </form>
  );
}
