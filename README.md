# QueryDesk — AI Support Assistant

QueryDesk is a full-stack customer support assistant that lets users upload knowledge documents (PDF, DOCX, TXT), ask natural-language questions in conversational threads, and receive source-grounded answers generated via Retrieval-Augmented Generation (RAG).

---

## Key Features

- **Authentication:** Email and password registration, login, and session persistence powered by Better Auth.
- **Multi-Chat Threads:** Create, switch, and delete up to 5 concurrent conversations per user.
- **Auto-Generated Titles:** Chat threads automatically take their title from the user's initial question and persist to PostgreSQL.
- **In-Chat Document Uploads:** Upload `.pdf`, `.docx`, and `.txt` files up to 10 MB directly into a conversation. Includes immediate in-flight visual feedback with uploading spinners, and retained `FAILED` states with error messages if processing encounters issues.
- **Context-Grounded Answers & Citations:** Answers are synthesized from retrieved document chunks, accompanied by source cards displaying document name, page number, relevance score, and text excerpts.
- **Cursor-Based Scroll Pagination:** Dynamically fetches older conversation turns when scrolling near the top while maintaining the user's scroll position.
- **Coordinated Resource Deletion:** Deleting a document or conversation removes database records and issues requests to delete corresponding vector points in Qdrant (coordinated deletion, rather than an atomic cross-system transaction).

---

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Lucide React
- **API Layer:** Next.js Route Handlers (`app/api/`)
- **RAG Microservice:** FastAPI, Uvicorn, Python 3.10+
- **Database & ORM:** PostgreSQL (Neon-compatible), Prisma ORM 7 (`@prisma/adapter-pg`)
- **Authentication:** Better Auth with Prisma PostgreSQL adapter
- **Vector Database:** Qdrant Cloud
- **AI & LLM Services:**
  - **Embeddings:** Google Gemini API (`models/text-embedding-004`)
  - **Generation:** Groq API (`llama-3.3-70b-versatile`)
- **Document Processing:** PyPDF, docx2txt, LangChain text splitters

---

## Architecture

```
┌───────────────────────┐
│  Next.js Frontend UI  │
└───────────┬───────────┘
            │ HTTP (Session Cookie)
            ▼
┌────────────────────────────────────────────────────────┐
│               Next.js Route Handlers                   │
│   (/api/auth, /api/chats, /api/chats/[id]/documents)   │
└───────────────┬────────────────────────┬───────────────┘
                │                        │
       Prisma 7 │                        │ HTTP Internal
                ▼                        ▼
     ┌────────────────────┐   ┌───────────────────────────┐
     │   PostgreSQL DB    │   │    FastAPI RAG Service    │
     │ (Users, Sessions,  │   │  - Document parsing       │
     │  Chats, Documents, │   │  - LangChain chunking     │
     │  Turns/Messages)   │   │  - Similarity retrieval   │
     └────────────────────┘   └───────┬───────────┬───────┘
                                      │           │
                Gemini API / Groq API │           │ Vector Search
                                      ▼           ▼
                           ┌─────────────┐     ┌────────────────┐
                           │ LLM & Embed │     │  Qdrant Cloud  │
                           └─────────────┘     └────────────────┘
```

- **Application & Data Management:** Next.js manages user sessions via Better Auth cookies and persists user, chat, document status, and message history in PostgreSQL through Prisma ORM.
- **Ingestion Pipeline:** Uploaded documents are saved as `PENDING` in PostgreSQL and forwarded to FastAPI. FastAPI parses and chunks text with LangChain, generates embeddings via Gemini, and indexes vectors into Qdrant tagged with `chat_id` and `document_id`. Upon completion, the database status updates to `READY`.
- **Retrieval & Answer Generation:** User queries trigger a vector similarity search in Qdrant filtered by `chat_id`. Top matching chunks are injected into a prompt sent to Groq for grounded answer generation. Results and citation metadata are persisted to PostgreSQL and returned to the client.

---

## Setup & Local Development

### Prerequisites

- Node.js 20+ and npm
- Python 3.10+ and `venv`
- PostgreSQL instance (e.g., Neon or local)
- Qdrant Cloud cluster or local instance
- Google Gemini and Groq API keys

### 1. Next.js Web Application

From the project root:

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables (see Environment Variables section below)
# Create .env in the project root

# 3. Synchronize database schema and generate Prisma client
npx prisma db push
npx prisma generate

# 4. Start Next.js development server
npm run dev
```

The application will be accessible at `http://localhost:3000`.

### 2. FastAPI RAG Service

From the `rag-service/` directory in a separate terminal:

```bash
cd rag-service

# 1. Create and activate a Python virtual environment
python -m venv .venv

# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate

# 2. Install Python dependencies (groq is listed in requirements.txt)
pip install -r requirements.txt

# 3. Configure environment variables (see Environment Variables section below)
# Create rag-service/.env

# 4. Initialize Qdrant collection and payload indexes (one-time setup for a fresh Qdrant cluster)
python setup_qdrant.py          # Creates the 'support_documents' collection (3072-dim vectors, cosine distance)
python setup_payload_indexes.py # Creates keyword indexes on chat_id and document_id for filtered search

# 5. Start the FastAPI service
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

The RAG service will run at `http://127.0.0.1:8000`.

---

## Environment Variables

### Root Application (.env)

```env
DATABASE_URL="postgresql://<user>:<password>@<host>/<database>?sslmode=require"
BETTER_AUTH_SECRET="<random-secret-key>"
BETTER_AUTH_URL="http://localhost:3000"
RAG_SERVICE_URL="http://127.0.0.1:8000"
```

### RAG Service (rag-service/.env)

```env
GEMINI_API_KEY="<your-gemini-api-key>"
GEMINI_EMBEDDING_MODEL="models/text-embedding-004"

GROQ_API_KEY="<your-groq-api-key>"
GROQ_GENERATION_MODEL="llama-3.3-70b-versatile"

QDRANT_URL="https://<cluster-id>.<region>.gcp.cloud.qdrant.io:6333"
QDRANT_API_KEY="<your-qdrant-api-key>"
QDRANT_COLLECTION="support_documents"
```

---

