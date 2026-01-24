export interface Item {
  id: number;
  name: string;
  userId: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ItemCreateData {
  name: string;
  userId: number;
}

export interface ItemUpdateData {
  name?: string;
}

export interface ItemResponse {
  id: number;
  name: string;
  userId: number;
  createdAt: Date;
  updatedAt: Date;
}

