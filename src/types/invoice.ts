export interface Invoice {
  id: number;
  userId: number;
  clientId: number;
  projectId?: number | null;
  invoiceNumber?: string;
  invoiceFileName?: string | null;
  invoiceDate: Date;
  dueDate: Date;
  subTotalAmount: number;
  gst: number; // GST percentage (e.g., 18 for 18%)
  totalAmount: number;
  currency?: string;
  totalInstallments: number;
  currentInstallment: number;
  additionalNotes: string;
  paymentReminderRepetition?: string[] | null; // Array of: '3', '7', 'Only on Due date', or null
  status: 'paid' | 'pending' | 'overdue';
  paymentTerms?: 'full' | 'advance_balance';
  advanceAmount?: number | null;
  balanceDue?: number | null;
  balanceDueDate?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceCreateData {
  clientId: number;
  projectId?: number | null;
  invoiceNumber?: string;
  invoiceDate: string | Date;
  dueDate: string | Date;
  subTotalAmount?: number;
  gst?: number; // GST percentage (e.g., 18 for 18%) - calculations done in frontend
  totalAmount?: number; // Calculated by frontend: subTotalAmount + (subTotalAmount * gst / 100)
  currency?: string;
  totalInstallments?: number;
  currentInstallment?: number;
  additionalNotes?: string;
  paymentReminderRepetition?: string[] | null; // Array of: '3', '7', 'Only on Due date', or null
  status?: 'paid' | 'pending' | 'overdue'; // Optional, defaults to 'pending' or 'overdue' based on dueDate
  paymentTerms?: 'full' | 'advance_balance';
  advanceAmount?: number | null;
  balanceDue?: number | null;
  balanceDueDate?: string | Date | null;
  userId: number;
  items?: InvoiceItemCreateData[];
}

export interface InvoiceUpdateData {
  clientId?: number;
  projectId?: number | null;
  invoiceNumber?: string;
  invoiceDate?: string | Date;
  dueDate?: string | Date;
  subTotalAmount?: number;
  gst?: number;
  totalAmount?: number;
  currency?: string;
  totalInstallments?: number;
  currentInstallment?: number;
  additionalNotes?: string;
  paymentReminderRepetition?: string[] | null; // Array of: '3', '7', 'Only on Due date', or null
  status?: 'paid' | 'pending' | 'overdue';
  paymentTerms?: 'full' | 'advance_balance';
  advanceAmount?: number | null;
  balanceDue?: number | null;
  balanceDueDate?: string | Date | null;
}

export interface InvoiceResponse {
  id: number;
  userId: number;
  clientId: number;
  projectId?: number | null;
  invoiceNumber: string;
  invoiceFileName?: string | null;
  invoiceDate: Date;
  dueDate: Date;
  subTotalAmount: number;
  gst: number; // GST percentage (e.g., 18 for 18%)
  totalAmount: number;
  currency?: string;
  totalInstallments: number;
  currentInstallment: number;
  additionalNotes: string;
  paymentReminderRepetition?: string[] | null; // Array of: '3', '7', 'Only on Due date', or null
  status: 'paid' | 'pending' | 'overdue';
  paymentTerms?: 'full' | 'advance_balance';
  advanceAmount?: number | null;
  balanceDue?: number | null;
  balanceDueDate?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceItemCreateData {
  itemsId: number;
  quantity: number;
  unitPrice: number;
}

