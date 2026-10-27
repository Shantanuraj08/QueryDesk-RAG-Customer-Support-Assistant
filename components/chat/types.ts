export interface Chat {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface DocumentItem {
  id: string;
  name: string;
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED" | "UPLOADING";
  createdAt: string;
  updatedAt?: string;
  size?: string;
  errorMessage?: string;
}

export interface Citation {
  citation?: string;
  filename?: string;
  document_id?: string;
  score?: number;
  metadata?: {
    page?: number | string;
    section?: string;
    source?: string;
    [key: string]: unknown;
  };
  snippet?: string;
}

export interface MessageTurn {
  id: string;
  question: string;
  answer: string | null;
  citations?: Citation[] | null;
  createdAt: string;
}

export interface UserSession {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}
