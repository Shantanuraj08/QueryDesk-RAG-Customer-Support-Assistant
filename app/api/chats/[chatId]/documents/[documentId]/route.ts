
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ chatId: string; documentId: string }> }
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

    const { chatId, documentId } = await params;

    // 2. Verify that the chat belongs to the user
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

    // 3. Verify that the document belongs to this chat
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        chatId,
      },
      select: { id: true, name: true },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    // 4. Call FastAPI to delete this document's Qdrant vectors
    const ragServiceUrl = process.env.RAG_SERVICE_URL;

    if (!ragServiceUrl) {
      console.error("RAG_SERVICE_URL is not configured");

      return NextResponse.json(
        { error: "RAG service is not configured" },
        { status: 500 }
      );
    }

    const ragUrl = new URL("/documents", ragServiceUrl);
    ragUrl.searchParams.set("chat_id", chatId);
    ragUrl.searchParams.set("document_id", documentId);

    let ragResponse: Response;

    try {
      ragResponse = await fetch(ragUrl, {
        method: "DELETE",
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "TimeoutError"
      ) {
        return NextResponse.json(
          { error: "RAG service timed out" },
          { status: 504 }
        );
      }

      throw error;
    }

    if (!ragResponse.ok) {
      console.error(
        "Qdrant vector deletion failed:",
        ragResponse.status
      );

      return NextResponse.json(
        { error: "Failed to delete document vectors" },
        { status: 502 }
      );
    }

    // 5. Delete the document metadata from PostgreSQL
    await prisma.document.delete({
      where: { id: documentId },
    });

    return NextResponse.json({
      message: "Document and its vectors deleted successfully",
      documentId,
      name: document.name,
    });
  } catch (error) {
    console.error("Document deletion error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
