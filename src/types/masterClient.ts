export interface MasterClient {
  id: number;
  organization?: string;
  fullName: string;
  email: string;
  mobileNumber?: string;
  gstin?: string;
  pan?: string;
  isActive?: boolean;
  userId: number;
  projectId?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MasterClientCreateData {
  organization?: string;
  fullName: string;
  email: string;
  mobileNumber?: string;
  gstin?: string;
  pan?: string;
  isActive?: boolean;
  userId: number;
  projectId?: number;
}

export interface MasterClientUpdateData {
  organization?: string;
  fullName?: string;
  email?: string;
  mobileNumber?: string;
  gstin?: string;
  pan?: string;
  isActive?: boolean;
  projectId?: number;
}

export interface MasterClientResponse {
  id: number;
  organization?: string;
  fullName: string;
  email: string;
  mobileNumber?: string;
  gstin?: string;
  pan?: string;
  isActive?: boolean;
  userId: number;
  projectId?: number;
  createdAt: Date;
  updatedAt: Date;
}

