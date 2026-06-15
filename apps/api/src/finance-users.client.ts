import { apiConfig } from "@repo/config";

export interface CreateFinanceUserDto {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  roleId: number;
}

export interface InviteFinanceUserDto {
  email: string;
  roleId: number;
  firstName?: string;
  lastName?: string;
}

export interface UpdateFinanceUserDto {
  roleId?: number;
  isActive?: boolean;
  firstName?: string;
  lastName?: string;
}

export class FinanceUsersClient {
  constructor(
    private readonly internalBaseUrl: string,
    private readonly secret: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-internal-secret": this.secret,
    };
  }

  private base(tenantId: number): string {
    return `${this.internalBaseUrl.replace(/\/+$/, "")}/api/internal/tenants/${tenantId}`;
  }

  async inviteUser(tenantId: number, data: InviteFinanceUserDto) {
    const res = await fetch(`${this.base(tenantId)}/users/invite`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`inviteUser failed: ${res.status}`);
    return res.json();
  }

  async createUser(tenantId: number, data: CreateFinanceUserDto) {
    const res = await fetch(`${this.base(tenantId)}/users`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`createUser failed: ${res.status}`);
    return res.json();
  }

  async listUsers(tenantId: number) {
    const res = await fetch(`${this.base(tenantId)}/users`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`listUsers failed: ${res.status}`);
    return res.json();
  }

  async updateUser(tenantId: number, userId: number, data: UpdateFinanceUserDto) {
    const res = await fetch(`${this.base(tenantId)}/users/${userId}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`updateUser failed: ${res.status}`);
    return res.json();
  }

  async deleteUser(tenantId: number, userId: number) {
    const res = await fetch(`${this.base(tenantId)}/users/${userId}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`deleteUser failed: ${res.status}`);
    return res.json();
  }

  async resetPassword(tenantId: number, userId: number, newPassword: string) {
    const res = await fetch(`${this.base(tenantId)}/users/${userId}/reset-password`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ newPassword }),
    });
    if (!res.ok) throw new Error(`resetPassword failed: ${res.status}`);
    return res.json();
  }

  async suspendUser(tenantId: number, userId: number) {
    const res = await fetch(`${this.base(tenantId)}/users/${userId}/suspend`, {
      method: "POST",
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`suspendUser failed: ${res.status}`);
    return res.json();
  }

  async activateUser(tenantId: number, userId: number) {
    const res = await fetch(`${this.base(tenantId)}/users/${userId}/activate`, {
      method: "POST",
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`activateUser failed: ${res.status}`);
    return res.json();
  }
}

export function createFinanceUsersClient(internalBaseUrl: string): FinanceUsersClient {
  const secret = apiConfig.internalApiSecret;
  if (!secret) {
    throw new Error("INTERNAL_API_SECRET is not configured");
  }
  return new FinanceUsersClient(internalBaseUrl, secret);
}
