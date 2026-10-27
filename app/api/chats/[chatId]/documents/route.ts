
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".txt"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  let documentId: string | undefined;

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

    // 2. Verify chat ownership
    const { chatId } = await params;

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

    // 3. Read and validate the uploaded file
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "Please provide a non-empty file" },
        { status: 400 }
      );
    }

    const extension = file.name
      .slice(file.name.lastIndexOf("."))
      .toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { error: "Only PDF, DOCX, and TXT files are allowed" },
        { status: 415 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size must not exceed 10 MB" },
        { status: 413 }
      );
    }

    // 4. Create the PostgreSQL document record
    const document = await prisma.document.create({
      data: {
        chatId,
        name: file.name,
        status: "PENDING",
      },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

    documentId = document.id;

    // 5. Forward the file and IDs to FastAPI
    const ragBaseUrl = process.env.RAG_SERVICE_URL;

    if (!ragBaseUrl) {
      throw new Error("RAG_SERVICE_URL is not configured");
    }

    const ragFormData = new FormData();
    ragFormData.append("file", file, file.name);
    ragFormData.append("chat_id", chatId);
    ragFormData.append("document_id", document.id);

    const ragResponse = await fetch(
      `${ragBaseUrl.replace(/\/+$/, "")}/upload`,
      {
        method: "POST",
        body: ragFormData,
        signal: AbortSignal.timeout(120_000),
      }
    );

    if (!ragResponse.ok) {
      throw new Error(
        `FastAPI returned status ${ragResponse.status}`
      );
    }

    const ragResult = await ragResponse.json();

    if (
      ragResult.status !== "success" ||
      typeof ragResult.points_stored !== "number" ||
      ragResult.points_stored <= 0
    ) {
      throw new Error("Document processing or storage failed");
    }

    // 6. Mark the document as ready
    const updatedDocument = await prisma.document.update({
      where: { id: document.id },
      data: { status: "READY" },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        document: updatedDocument,
        processing: {
          chunksCreated: ragResult.chunks_created,
          pointsStored: ragResult.points_stored,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Document upload error:", error);

    // 7. Mark the record as failed if one was created
    if (documentId) {
      try {
        await prisma.document.update({
          where: { id: documentId },
          data: { status: "FAILED" },
        });
      } catch (dbError) {
        console.error("Failed to update document status:", dbError);
      }
    }

    return NextResponse.json(
      { error: "Document upload or processing failed" },
      { status: 500 }
    );
  }
}



type RouteContext = {
  params: Promise<{ chatId: string }>;
};

export async function GET(
  request: Request,
  { params }: RouteContext
) {
  try {
    // 1. Authenticate the user
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 2. Get chat ID from the route
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

    // 4. Read pagination parameters
    const { searchParams } = new URL(request.url);

    const rawLimit = searchParams.get("limit") ?? "10";
    const limit = Number(rawLimit);
    const cursor = searchParams.get("cursor");

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50
    ) {
      return NextResponse.json(
        { error: "Limit must be between 1 and 50" },
        { status: 400 }
      );
    }

    // 5. Validate cursor belongs to this chat
    if (cursor) {
      const cursorDocument = await prisma.document.findFirst({
        where: {
          id: cursor,
          chatId,
        },
        select: { id: true },
      });

      if (!cursorDocument) {
        return NextResponse.json(
          { error: "Invalid cursor" },
          { status: 400 }
        );
      }
    }

    // 6. Fetch one extra document to detect more results
    const documents = await prisma.document.findMany({
      where: { chatId },
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const hasMore = documents.length > limit;
    const page = hasMore
      ? documents.slice(0, limit)
      : documents;

    const nextCursor = hasMore
      ? page[page.length - 1].id
      : null;

    // 7. Return paginated document metadata
    return NextResponse.json({
      documents: page,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error("GET /api/chats/[chatId]/documents:", error);

    return NextResponse.json(
      { error: "Failed to fetch documents" },
      { status: 500 }
    );
  }
}