import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    // 1. Authenticate the user
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 2. Extract chatId
    const { chatId } = await params;

    // 3. Verify chat ownership
    const chat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        userId: session.user.id,
      },
      select: { id: true },
    });

    if (!chat) {
      return NextResponse.json(
        { error: "Chat not found" },
        { status: 404 }
      );
    }

    // 4. Validate FastAPI service configuration
    const ragServiceUrl = process.env.RAG_SERVICE_URL;

    if (!ragServiceUrl) {
      console.error("RAG_SERVICE_URL is not configured");

      return NextResponse.json(
        { error: "RAG service is not configured" },
        { status: 500 }
      );
    }

    // 5. Delete all Qdrant vectors belonging to this chat
    const ragUrl = new URL("/documents", ragServiceUrl);
    ragUrl.searchParams.set("chat_id", chatId);

    let ragResponse: Response;

    try {
      ragResponse = await fetch(ragUrl, {
        method: "DELETE",
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      const isTimeout =
        error instanceof Error &&
        (error.name === "TimeoutError" ||
          error.name === "AbortError");

      console.error("Chat vector deletion request failed:", error);

      return NextResponse.json(
        {
          error: isTimeout
            ? "RAG service timed out"
            : "Could not contact RAG service",
          chatId,
        },
        { status: isTimeout ? 504 : 502 }
      );
    }

    if (!ragResponse.ok) {
      console.error(
        "Failed to delete chat vectors:",
        ragResponse.status
      );

      return NextResponse.json(
        { error: "Failed to delete chat vectors" },
        { status: 502 }
      );
    }

    // 6. Delete PostgreSQL records after Qdrant confirms success
    await prisma.$transaction(async (tx) => {
      // Recheck ownership before deleting database records
      const existingChat = await tx.chat.findFirst({
        where: {
          id: chatId,
          userId: session.user.id,
        },
        select: { id: true },
      });

      if (!existingChat) {
        throw new Error("Chat no longer exists or ownership changed");
      }

      await tx.turn.deleteMany({
        where: { chatId },
      });

      await tx.document.deleteMany({
        where: { chatId },
      });

      await tx.chat.delete({
        where: {
          id: chatId,
          userId: session.user.id,
        },
      });
    });

    // 7. Return success
    return NextResponse.json({
      message:
        "Chat, documents, messages, and vectors deleted successfully",
      chatId,
    });
  } catch (error) {
    console.error("Chat deletion error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}