import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  req: NextRequest,
  { params }: { params: { ticker: string; id: string } }
) {
  const body = await req.json();
  const { humanNote } = body;

  // `status` and `evidence` are AI-owned (set by the research pipeline) and
  // cannot be mutated from the client. The human's input is `humanNote`.
  // Relationship re-extraction is now task-driven (summarize → extract), so
  // it is not triggered here.
  if (humanNote === undefined) {
    return NextResponse.json(
      { error: "Only `humanNote` is editable; status and evidence are AI-owned." },
      { status: 400 }
    );
  }

  try {
    const claim = await prisma.claim.update({
      where: { id: parseInt(params.id) },
      data: { humanNote: humanNote?.trim() || null },
    });
    return NextResponse.json(claim);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
