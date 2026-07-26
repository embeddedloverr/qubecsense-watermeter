import type { Schema } from "mongoose";

// Development-only guard against unscoped tenant queries.
//
// Must be applied to a schema BEFORE mongoose.model() compiles it — hooks
// added to an already-compiled model are silently ignored, which is exactly
// the trap this file exists to avoid.
//
// Set STRICT_TENANT_QUERIES=true to turn the warnings into thrown errors
// (useful in CI); DISABLE_TENANT_SCOPE_CHECK=true to switch it off entirely.

export function tenantScope(schema: Schema, opts: { name: string }) {
  if (process.env.NODE_ENV === "production") return;
  if (process.env.DISABLE_TENANT_SCOPE_CHECK === "true") return;

  const model = opts.name;

  const complain = (op: string) => {
    const msg =
      `[tenant-scope] ${model}.${op}() ran without a siteId filter — ` +
      `scope it with guard()/scoped(ctx, …) or it will read across sites.`;
    if (process.env.STRICT_TENANT_QUERIES === "true") throw new Error(msg);
    // Third frame is usually the calling route/page.
    const where = new Error().stack?.split("\n")[3]?.trim();
    console.warn(msg, where ? `\n    at ${where}` : "");
  };

  schema.pre(
    /^(find|count|update|delete|replace)/ as unknown as RegExp,
    function (this: any) {
      const filter = this.getFilter?.() ?? {};
      if (!("siteId" in filter)) complain(this.op || "find");
    }
  );

  // Query middleware does not cover aggregate — and an aggregate with no
  // $match is exactly how identically numbered flats in different sites got
  // merged into one thread.
  schema.pre("aggregate", function (this: any) {
    const first = this.pipeline?.()[0];
    if (!first?.$match || !("siteId" in first.$match)) complain("aggregate");
  });
}
