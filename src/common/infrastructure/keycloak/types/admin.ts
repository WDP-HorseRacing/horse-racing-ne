/** UserRepresentation. */
export interface KeycloakUserRepresentation {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
  emailVerified: boolean;
  requiredActions?: string[];
}

/** RoleRepresentation, tra ve tu GET /admin/realms/{realm}/roles/{name}. */
export interface KeycloakRoleRepresentation {
  id: string;
  name: string;
  description?: string;
  composite?: boolean;
  clientRole?: boolean;
  containerId?: string;
}

/** Body cua POST /admin/realms/{realm}/users. */
export interface KeycloakCreateUserParams {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}
