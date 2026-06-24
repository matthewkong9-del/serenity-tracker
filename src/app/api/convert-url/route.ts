import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    const { stdout } = await execAsync(`npx markit "${url}" -q`, {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return NextResponse.json({ markdown: stdout?.trim() || "" });
  } catch (e: any) {
    return NextResponse.json({ error: `Conversion failed: ${e.message}` }, { status: 500 });
  }
}
