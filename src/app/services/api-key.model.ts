export interface APIKey {
  _id: string;
  apiKey: string; // STK-{5 digit alphanumeric} - API Key for authentication
  name: string;
  userId: string;
  createdDate: string;
  description?: string;
  isActive: boolean;
  isDeleted?: boolean; // Soft delete flag
  deletedAt?: string; // When the key was deleted
  retentionExpiresAt?: string; // When the key data will be permanently deleted
}

export interface CreateAPIKeyRequest {
  name: string;
  description?: string;
}

export interface APIKeyResponse {
  status: number;
  message: string;
  apiKey: APIKey;
}

export interface UserAPIKeysResponse {
  status: number;
  message: string;
  apiKeys: APIKey[];
}