
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException,Query,UploadFile
from pydantic import BaseModel, Field
from fastapi import Form, File, UploadFile
from services.document_parser import load_document
from services.text_splitter import split_documents
from services.embedding_service import embed_texts
from services.qdrant_service import store_chunks
from uuid import uuid4     #temp
from services.retrieval_service import retrieve_chunks
from services.generation_service import generate_answer
from services.qdrant_service import (
    store_chunks,
    client,
    QDRANT_COLLECTION,
)
from qdrant_client.models import (
    Filter,
    FieldCondition,
    MatchValue,
)

app = FastAPI(
    title="Customer Support RAG API",
    version="0.1.0",
)

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@app.get("/")
def health_check():
    return {
        "status": "running",
        "service": "Customer Support RAG API",
    }


@app.post("/upload")
async def upload_document( chat_id: str = Form(...), file: UploadFile = File(...),document_id: str = Form(...),):
    filename = Path(file.filename or "").name
    extension = Path(filename).suffix.lower()

    if not filename or extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only PDF, DOCX, and TXT files are supported.",
        )

    temp_path = None

    try:
        content = await file.read(MAX_FILE_SIZE + 1)
         # we read +1 byte more only preventing us to read large size file byte 
        if not content:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is empty.",
            )

        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail="File exceeds the 10 MB limit.",
            )

        with tempfile.NamedTemporaryFile(
            suffix=extension, delete=False
        ) as temp_file:
            temp_file.write(content)
            temp_path = Path(temp_file.name)

        documents = load_document(str(temp_path))
        
        # Replace the temporary path with the original filename.
        for document in documents:
            document.metadata["source"] = filename
        
        chunks = split_documents(documents)
        
        texts = [chunk.page_content for chunk in chunks]

        vectors = embed_texts(texts)

        points_stored = store_chunks(
            chunks=chunks,
            vectors=vectors,
            filename=filename,
            chat_id=chat_id,
            document_id=document_id,
        )

        extracted_text = "\n\n".join(
            document.page_content.strip()
            for document in documents
            if document.page_content.strip()
        )

        if not extracted_text:
            raise HTTPException(
                status_code=422,
                detail=(
                    "No extractable text found. "
                    "Scanned or image-based PDFs are not supported yet."
                ),
            )

        return {
            "filename": filename,
            "status": "success",
            "documents_loaded": len(documents),
            "characters_extracted": len(extracted_text),
            "chunks_created": len(chunks),
            "vectors_generated": len(vectors),
            "vector_dimensions": len(vectors[0]) if vectors else 0,
            "points_stored": points_stored,
        }

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=422,
            detail="Could not process this file. Check that it is valid.",
        )

    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)

        await file.close()


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    chat_id: str = Field(min_length=1)
    document_id: str | None = None
    top_k: int = Field(default=3, ge=1, le=10)    #number of chunks to retrieve for futrue MVP allow user to modify the contnext

@app.post("/chat")
def chat(request: ChatRequest):
    question = request.question.strip()
    chat_id = request.chat_id.strip()

    if not question:
        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty.",
        )

    if not chat_id:
        raise HTTPException(
            status_code=400,
            detail="Chat ID cannot be empty.",
        )

    try:
        # 1. Retrieve relevant chunks from Qdrant.
        chunks = retrieve_chunks(
            question=question,
            chat_id=chat_id,
            document_id=request.document_id,
            limit=request.top_k,
        )

        # 2. Return a fallback if retrieval finds nothing.
        if not chunks:
            return {
                "question": question,
                "answer": (
                    "I couldn't find relevant information "
                    "in the available documents."
                ),
                "sources": [],
            }

        # 3. Generate an answer using the retrieved context.
        answer = generate_answer(
            question=question,
            retrieved_chunks=chunks,
        )

        # 4. Return source metadata alongside the answer.
        sources = []

        for index, chunk in enumerate(chunks, start=1):
            sources.append({
                "citation": f"Source {index}",
                "filename": chunk.get("source", "Unknown document"),
                "document_id": chunk.get("document_id"),
                "score": chunk.get("score"),
                "metadata": chunk.get("metadata", {}),
            })

        return {
            "question": question,
            "answer": answer,
            "sources": sources,
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        # Log the full error in the backend terminal.
        print(f"Chat endpoint error: {exc}")

        raise HTTPException(
            status_code=502,
            detail="Unable to generate an answer right now. Please try again.",
        ) from exc


@app.delete("/documents")
def delete_document_vectors(
    chat_id: str = Query(..., min_length=1),
    document_id: str | None = Query(default=None, min_length=1),
):
    try:
        # Build the filter conditions
        conditions = [
            FieldCondition(
                key="chat_id",
                match=MatchValue(value=chat_id),
            )
        ]

        # Add document_id only when provided
        if document_id is not None:
            conditions.append(
                FieldCondition(
                    key="document_id",
                    match=MatchValue(value=document_id),
                )
            )

        # Delete points matching ALL conditions
        client.delete(
            collection_name=QDRANT_COLLECTION,
            points_selector=Filter(must=conditions),
            wait=True,
        )

        return {
            "message": "Vectors deleted successfully",
            "chat_id": chat_id,
            "document_id": document_id,
        }

    except Exception as e:
        print(f"Failed to delete vectors: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to delete vectors",
        )