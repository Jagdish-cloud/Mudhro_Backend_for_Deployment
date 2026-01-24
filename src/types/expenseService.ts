export interface ExpenseService {
  id: number;
  name: string;
  description?: string | null;
  defaultRate: number;
  userId: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpenseServiceCreateData {
  name: string;
  description?: string;
  defaultRate?: number;
  userId: number;
}

export interface ExpenseServiceUpdateData {
  name?: string;
  description?: string | null;
  defaultRate?: number;
}

export interface ExpenseServiceResponse {
  id: number;
  name: string;
  description?: string | null;
  defaultRate: number;
  userId: number;
  createdAt: Date;
  updatedAt: Date;
}


