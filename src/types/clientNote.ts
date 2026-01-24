export interface ClientNote {
  id: number;
  clientId: number;
  userId: number;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientNoteCreateData {
  note: string;
}

export interface ClientNoteUpdateData {
  note: string;
}

export interface ClientNoteResponse {
  id: number;
  clientId: number;
  userId: number;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}

