
import os

from dotenv import load_dotenv
from qdrant_client import QdrantClient, models

load_dotenv()

client = QdrantClient(
    url=os.getenv("QDRANT_URL"),
    api_key=os.getenv("QDRANT_API_KEY"),
)

collection_name = os.getenv(
    "QDRANT_COLLECTION",
    "support_documents",
)

if not client.collection_exists(collection_name):
    client.create_collection(
        collection_name=collection_name,
        vectors_config=models.VectorParams(
            size=3072,
            distance=models.Distance.COSINE,
        ),
    )
    print(f"Collection '{collection_name}' created.")
else:
    print(f"Collection '{collection_name}' already exists.")

print("Collections:", client.get_collections())
