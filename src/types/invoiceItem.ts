export interface InvoiceItem {
  id: number;
  invoiceId: number;
  itemsId: number;
  quantity: number;
  unitPrice: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceItemCreateData {
  itemsId: number;
  quantity: number;
  unitPrice: number;
}

export interface InvoiceItemUpdateData {
  quantity?: number;
  unitPrice?: number;
}

export interface InvoiceItemResponse {
  id: number;
  invoiceId: number;
  itemsId: number;
  quantity: number;
  unitPrice: number;
  itemName?: string;
  createdAt: Date;
  updatedAt: Date;
}

