export interface ExpenseItem {
  id: number;
  expenseId: number;
  serviceId: number;
  quantity: number;
  unitPrice: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpenseItemCreateData {
  serviceId: number;
  quantity: number;
  unitPrice: number;
}

export interface ExpenseItemUpdateData {
  quantity?: number;
  unitPrice?: number;
}

export interface ExpenseItemResponse {
  id: number;
  expenseId: number;
  serviceId: number;
  quantity: number;
  unitPrice: number;
  serviceName?: string;
  createdAt: Date;
  updatedAt: Date;
}