// Administrador da plataforma: só ele vê e acessa Metas e Talkie
export const ADMIN_EMAIL = "emerson.consolin@gmail.com";

export function isPlatformAdmin(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === ADMIN_EMAIL;
}
