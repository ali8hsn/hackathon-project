import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Lightweight build/deploy probe used by the Settings panel's connection
// status pill. `.git-sha` is dropped on the box by scripts/redeploy.sh
// during every redeploy. `.deployed-at` is also written there.
export async function GET() {
  const root = process.cwd();
  let sha = "unknown";
  let deployedAt: string | null = null;

  try {
    sha = (await fs.readFile(path.join(root, ".git-sha"), "utf8")).trim() || "unknown";
  } catch {
    // .git-sha only exists on the deployed box; locally we just return "unknown".
  }

  try {
    const raw = await fs.readFile(path.join(root, ".deployed-at"), "utf8");
    const m = raw.match(/deployed_at=(.+)/);
    if (m) deployedAt = m[1].trim();
  } catch {
    // Same — only present on the box.
  }

  return NextResponse.json({
    sha,
    shortSha: sha.length >= 7 ? sha.slice(0, 7) : sha,
    deployedAt,
    bootedAt: process.env.SIREN_BOOTED_AT ?? null,
    nodeVersion: process.version,
  });
}
