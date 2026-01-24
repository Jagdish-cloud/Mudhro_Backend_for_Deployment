export interface User {
  id: number;
  fullName: string;
  email: string;
  password: string;
  country?: string;
  mobileNumber?: string;
  planId?: string;
  logo?: string;
  gstin?: string;
  pan?: string;
  emailVerified: boolean;
  isActive: boolean;
  isTwoFactorEnabled: boolean;
  twoFactorSecret?: string;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
  loginAttempts: number;
  refreshToken?: string;
  jwtIssuedAt?: Date;
  jwtExpiresAt?: Date;
  currency?: string;
}

export interface UserRegistrationData {
  // id is auto-generated, should not be provided
  fullName: string;
  email: string;
  password: string;
  country?: string;
  mobileNumber?: string;
  planId?: string;
  logo?: string;
  gstin?: string;
  pan?: string;
  currency?: string;
}

export interface UserResponse {
  id: number;
  fullName: string;
  email: string;
  country?: string;
  mobileNumber?: string;
  planId?: string;
  logo?: string;
  gstin?: string;
  pan?: string;
  currency?: string;
  emailVerified: boolean;
  isActive: boolean;
  isTwoFactorEnabled: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: UserResponse;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
}

export interface UserUpdateData {
  fullName?: string;
  email?: string;
  country?: string;
  mobileNumber?: string;
  gstin?: string;
  pan?: string;
  currency?: string;
  logo?: string;
}

