export interface VendorNote {
  id: number;
  vendorId: number;
  userId: number;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VendorNoteCreateData {
  note: string;
}

export interface VendorNoteUpdateData {
  note: string;
}

export interface VendorNoteResponse {
  id: number;
  vendorId: number;
  userId: number;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}

