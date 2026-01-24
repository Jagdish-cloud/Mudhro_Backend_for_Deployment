export interface Vendor {
  id: number;
  organization?: string | null;
  fullName: string;
  email: string;
  mobileNumber?: string | null;
  gstin?: string | null;
  pan?: string | null;
  isActive?: boolean;
  userId: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface VendorCreateData {
  organization?: string;
  fullName: string;
  email: string;
  mobileNumber?: string;
  gstin?: string;
  pan?: string;
  isActive?: boolean;
  userId: number;
}

export interface VendorUpdateData {
  organization?: string;
  fullName?: string;
  email?: string;
  mobileNumber?: string;
  gstin?: string;
  pan?: string;
  isActive?: boolean;
}

export interface VendorResponse {
  id: number;
  organization?: string | null;
  fullName: string;
  email: string;
  mobileNumber?: string | null;
  gstin?: string | null;
  pan?: string | null;
  isActive?: boolean;
  userId: number;
  createdAt: Date;
  updatedAt: Date;
}


