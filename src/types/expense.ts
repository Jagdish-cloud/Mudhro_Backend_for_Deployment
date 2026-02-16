export interface ExpenseItemCreateData {
  serviceId: number;
  quantity: number;
  unitPrice: number;
}

export interface Expense {
  id: number;
  userId: number;
  vendorId: number;
  projectId: number | null;
  billNumber: string;
  billDate: Date;
  dueDate: Date;
  taxPercentage: number;
  subTotalAmount: number;
  totalAmount: number;
  attachmentFileName: string | null;
  expenseFileName: string | null;
  additionalNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpenseCreateData {
  vendorId: number;
  projectId?: number | null;
  billNumber?: string;
  billDate: string | Date;
  dueDate: string | Date;
  subTotalAmount?: number;
  totalAmount?: number;
  taxPercentage?: number;
  additionalNotes?: string;
  userId: number;
  items?: ExpenseItemCreateData[];
}

export interface ExpenseUpdateData {
  vendorId?: number;
  projectId?: number;
  billNumber?: string;
  billDate?: string | Date;
  dueDate?: string | Date;
  subTotalAmount?: number;
  totalAmount?: number;
  taxPercentage?: number;
  additionalNotes?: string | null;
}

export interface ExpenseResponse {
  id: number;
  userId: number;
  vendorId: number;
  projectId: number | null;
  billNumber: string;
  billDate: Date;
  dueDate: Date;
  taxPercentage: number;
  subTotalAmount: number;
  totalAmount: number;
  attachmentFileName: string | null;
  expenseFileName: string | null;
  additionalNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  vendorName?: string | null;
}


