
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";

const PAGE_SIZE = 10;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    // 1. Check authentication
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { chatId } = await params;

    // 2. Check that the chat belongs to the logged-in user
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

    // 3. Read the optional cursor
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");

    // 4. Validate the cursor and fetch its ordering fields
    const cursorTurn = cursor
      ? await prisma.turn.findFirst({
          where: {
            id: cursor,
            chatId,
          },
          select: {
            id: true,
            createdAt: true,
          },
        })
      : null;

    if (cursor && !cursorTurn) {
      return NextResponse.json(
        { error: "Invalid cursor" },
        { status: 400 }
      );
    }

    // 5. Fetch the latest 10 turns, or the next older page
    const results = await prisma.turn.findMany({
      where: cursorTurn
        ? {
            chatId,
            OR: [
              {
                createdAt: {
                  lt: cursorTurn.createdAt,
                },
              },
              {
                createdAt: cursorTurn.createdAt,
                id: {
                  lt: cursorTurn.id,
                },
              },
            ],
          }
        : { chatId },

      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],

      take: PAGE_SIZE + 1,

      select: {
        id: true,
        question: true,
        answer: true,
        citations: true,
        createdAt: true,
      },
    });

    // 6. Determine whether another page exists
    const hasMore = results.length > PAGE_SIZE;
    const turns = results.slice(0, PAGE_SIZE);

    // 7. Return the cursor for the next older page
    const nextCursor = hasMore
      ? turns[turns.length - 1].id
      : null;

    // 8. Return turns in chronological order
    turns.reverse();

    return NextResponse.json({
      turns,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error("Fetch conversation error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}




type RouteContext = {
  params: Promise<{ chatId: string }>;
};

export async function POST(
  request: Request,
  { params }: RouteContext
) {
  let pendingTurnId: string | undefined;
  let answerSaved = false;

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

    // 2. Get the chat ID from the URL
    const { chatId } = await params;

    // 3. Verify that the chat belongs to the logged-in user
    const chat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        userId: session.user.id,
      },
      select: { id: true, title: true },
    });

    if (!chat) {
      return NextResponse.json(
        { error: "Chat not found" },
        { status: 404 }
      );
    }

    // 4. Parse and validate the JSON request body
    const body = await request.json().catch(() => null);

    if (
      !body ||
      typeof body.question !== "string" ||
      !body.question.trim()
    ) {
      return NextResponse.json(
        { error: "A question is required" },
        { status: 400 }
      );
    }

    const question = body.question.trim();

    // Match FastAPI's ChatRequest max_length=2000
    if (question.length > 2000) {
      return NextResponse.json(
        {
          error: "Question must be 2000 characters or fewer",
        },
        { status: 400 }
      );
    }

    // 5. Create a pending Turn in PostgreSQL
    const pendingTurn = await prisma.turn.create({
      data: {
        chatId,
        question,
        answer: null,
        citations: Prisma.JsonNull,
      },
      select: { id: true },
    });

    pendingTurnId = pendingTurn.id;

    // 6. Call the FastAPI RAG service
    const ragBaseUrl = process.env.RAG_SERVICE_URL;

    if (!ragBaseUrl) {
      throw new Error("RAG_SERVICE_NOT_CONFIGURED");
    }

    const ragResponse = await fetch(
      `${ragBaseUrl.replace(/\/+$/, "")}/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          question,
        }),
        signal: AbortSignal.timeout(120_000),
        cache: "no-store",
      }
    );

    if (!ragResponse.ok) {
      console.error(
        "FastAPI /chat failed with status:",
        ragResponse.status
      );

      throw new Error("RAG_SERVICE_FAILED");
    }

    const ragData = await ragResponse.json();

    // 7. Validate the AI answer
    if (
      typeof ragData.answer !== "string" ||
      !ragData.answer.trim()
    ) {
      throw new Error("INVALID_RAG_RESPONSE");
    }

    const answer = ragData.answer;
    const citations = ragData.sources;

    // 8. Save the answer and sources to the existing Turn
    const savedTurn = await prisma.turn.update({
      where: { id: pendingTurnId },
      data: {
        answer,
        ...(citations !== undefined && {
          citations:
            citations === null
              ? Prisma.JsonNull
              : (citations as Prisma.InputJsonValue),
        }),
      },
      select: {
        id: true,
        chatId: true,
        question: true,
        answer: true,
        citations: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Mark the answer as saved before performing other operations.
    // This prevents cleanup from deleting a successful answer.
    answerSaved = true;

    // 9. Update the chat's last-activity timestamp and title if it's the first message
    let updatedTitle: string | undefined;
    try {
      const shouldUpdateTitle = !chat.title || chat.title === "New Chat";
      if (shouldUpdateTitle) {
        updatedTitle =
          question.length > 28 ? question.slice(0, 28) + "..." : question;
      }

      await prisma.chat.update({
        where: { id: chatId },
        data: {
          updatedAt: new Date(),
          ...(updatedTitle && { title: updatedTitle }),
        },
      });
    } catch (timestampError) {
      // The answer is already saved, so don't fail the whole request.
      console.error(
        "Could not update chat timestamp/title:",
        timestampError
      );
    }

    // 10. Return the persisted message
    return NextResponse.json(
      {
        message: savedTurn,
        ...(updatedTitle && { chatTitle: updatedTitle }),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "POST /api/chats/[chatId]/messages:",
      error
    );

    // Delete only an incomplete Turn.
    // Never delete an answer that has already been saved.
    if (pendingTurnId && !answerSaved) {
      try {
        await prisma.turn.delete({
          where: { id: pendingTurnId },
        });
      } catch (cleanupError) {
        console.error(
          "Could not clean up pending Turn:",
          cleanupError
        );
      }
    }

    if (
      error instanceof Error &&
      error.name === "TimeoutError"
    ) {
      return NextResponse.json(
        {
          error:
            "The AI service timed out. Please try again.",
        },
        { status: 504 }
      );
    }

    if (
      error instanceof Error &&
      error.message === "RAG_SERVICE_FAILED"
    ) {
      return NextResponse.json(
        {
          error:
            "The AI service could not process your question.",
        },
        { status: 502 }
      );
    }

    if (
      error instanceof Error &&
      error.message === "RAG_SERVICE_NOT_CONFIGURED"
    ) {
      return NextResponse.json(
        { error: "The AI service is not configured." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Failed to process your message" },
      { status: 500 }
    );
  }
}