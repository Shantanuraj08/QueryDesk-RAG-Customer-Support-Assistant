
import os

from dotenv import load_dotenv
from google import genai

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
EMBEDDING_MODEL = os.getenv("GEMINI_EMBEDDING_MODEL")

if not api_key:
    raise ValueError("GEMINI_API_KEY not found in .env")

if not EMBEDDING_MODEL:
    raise ValueError("GEMINI_EMBEDDING_MODEL not found in .env")

client = genai.Client(api_key=api_key)


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Generate an embedding vector for each text."""

    if not texts:
        return []

    vectors = []

    for text in texts:
        response = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=text,
        )
    
        vectors.append(response.embeddings[0].values)

    return vectors
