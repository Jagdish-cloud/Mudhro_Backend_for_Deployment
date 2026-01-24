export interface Project {
  id: number;
  name: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  status: 'active' | 'completed' | 'on-hold' | 'cancelled';
  budget?: number;
  userId: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectCreateData {
  name: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  status?: 'active' | 'completed' | 'on-hold' | 'cancelled';
  budget?: number;
  userId: number;
}

export interface ProjectUpdateData {
  name?: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  status?: 'active' | 'completed' | 'on-hold' | 'cancelled';
  budget?: number;
}

export interface ProjectResponse {
  id: number;
  name: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  status: 'active' | 'completed' | 'on-hold' | 'cancelled';
  budget?: number;
  userId: number;
  createdAt: Date;
  updatedAt: Date;
  clientCount?: number; // Optional: number of clients in this project
}
