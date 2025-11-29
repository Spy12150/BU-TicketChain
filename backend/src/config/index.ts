import { config as dotenvConfig } from "dotenv";

// Load environment variables
dotenvConfig();

export const config = {
  // Server
  port: parseInt(process.env.PORT || "3001", 10),
  host: process.env.HOST || "0.0.0.0",

  // JWT
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-in-production",
  jwtExpiresIn: "7d",

  // Blockchain
  rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
  contractAddress: process.env.CONTRACT_ADDRESS || "",
  backendPrivateKey: process.env.BACKEND_PRIVATE_KEY || "",

  // Database
  databaseUrl: process.env.DATABASE_URL || "",
} as const;

// Validate required config in production
export function validateConfig(): void {
  const requiredVars = ["DATABASE_URL", "JWT_SECRET"];

  if (process.env.NODE_ENV === "production") {
    requiredVars.push("CONTRACT_ADDRESS", "RPC_URL");
  }

  const missing = requiredVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

