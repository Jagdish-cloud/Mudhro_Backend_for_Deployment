export interface Payment {
  id: number;
  invoiceId: number;
  userId: number;
  clientId: number;
  invoiceAmount: number;
  amountReceived: number;
  paymentGatewayFee: number;
  tdsDeducted: number;
  otherDeduction: number;
  finalAmount: number;
  paymentDate: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentCreateData {
  invoiceId: number;
  amountReceived: number;
  paymentGatewayFee?: number;
  tdsDeducted?: number;
  otherDeduction?: number;
  notes?: string;
  paymentDate?: string | Date;
}

export interface PaymentUpdateData {
  amountReceived?: number;
  paymentGatewayFee?: number;
  tdsDeducted?: number;
  otherDeduction?: number;
  notes?: string;
  paymentDate?: string | Date;
}

export interface PaymentResponse {
  id: number;
  invoiceId: number;
  userId: number;
  clientId: number;
  invoiceAmount: number;
  amountReceived: number;
  paymentGatewayFee: number;
  tdsDeducted: number;
  otherDeduction: number;
  finalAmount: number;
  paymentDate: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

