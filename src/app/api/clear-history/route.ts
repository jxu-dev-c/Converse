import { validateRequest } from "@/app/_auth/validate-request";
import { ragChat } from "@/app/lib/rag-chat";
import { NextRequest, NextResponse } from "next/server";

export const POST = async (req: NextRequest) => {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return new Response("Forbidden", { status: 403 });
  const { session } = await validateRequest();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const sessionId = session.id;

  try {
    await ragChat.history.deleteMessages({sessionId});
  } catch (error) {
    return NextResponse.json({error: error}, {status: 500});
  }
  return NextResponse.json({success: true});
};
