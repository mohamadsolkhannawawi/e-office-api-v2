import env from "env-var";

export const config = {
  NODE_ENV: env
    .get("NODE_ENV")
    .default("development")
    .asEnum(["production", "test", "development"]),

  PORT: env.get("PORT").default(3000).asPortNumber(),
  API_URL: env
    .get("API_URL")
    .default(`https://${env.get("PUBLIC_DOMAIN").asString()}`)
    .asString(),
  DATABASE_URL: env.get("DATABASE_URL").required().asString(),
  LOCK_STORE: env.get("LOCK_STORE").default("memory").asEnum(["memory"]),

  // URL frontend untuk tautan verifikasi kode QR.
  // Gunakan prefix /persuratan-rekomendasi agar kompatibel di production.
  FRONTEND_URL: env
    .get("FE_URL")
    .default("http://localhost:3000/persuratan-rekomendasi")
    .asString(),

  // Endpoint API SSO FSM UNDIP.
  SSO_API_URL: env
    .get("SSO_API_URL")
    .default("https://apps-fsm.undip.ac.id/sso_api")
    .asString(),
};
