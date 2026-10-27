
from qdrant_client import models

from services.embedding_service import embed_texts
from services.qdrant_service import client, QDRANT_COLLECTION


def retrieve_chunks(
    question: str,
    chat_id: str,
    document_id: str | None = None,
    limit: int = 5,
):
    if not question.strip():
        raise ValueError("Question cannot be empty.")

    # 1. Convert the question into an embedding.
    query_vector = embed_texts([question])[0]

    # 2. Restrict search to the requested chat.
    conditions = [
        models.FieldCondition(
            key="chat_id",
            match=models.MatchValue(value=chat_id),
        )
    ]

    # Optionally restrict search to one document.
    if document_id:
        conditions.append(
            models.FieldCondition(
                key="document_id",
                match=models.MatchValue(value=document_id),
            )
        )

    query_filter = models.Filter(must=conditions)

    # 3. Search Qdrant for the most similar chunks.
    response = client.query_points(
        collection_name=QDRANT_COLLECTION,
        query=query_vector,
        query_filter=query_filter,
        limit=limit,
        with_payload=True,
        with_vectors=False,
    )

    # 4. Return useful information for each matching chunk.
    results = []

    for point in response.points:
        payload = point.payload or {}

        results.append({
            "text": payload.get("text", ""),
            "source": payload.get("source", ""),
            "chat_id": payload.get("chat_id"),
            "document_id": payload.get("document_id"),
            "metadata": payload.get("metadata", {}),
            "score": point.score,
        })

    return results
