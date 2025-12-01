// import { FastifyRequest, FastifyReply } from "fastify";
// import { Role } from "@prisma/client";

// // Type for JWT payload
// export interface JwtPayload {
//   userId: string;
//   email: string;
//   role: Role;
//   walletAddress?: string;
// }

// // Extend FastifyRequest to include user
// declare module "fastify" {
//   interface FastifyRequest {
//     user?: JwtPayload;
//   }
// }

// /**
//  * Authentication middleware - verifies JWT token
//  */
// export async function authenticate(
//   request: FastifyRequest,
//   reply: FastifyReply
// ): Promise<void> {
//   try {
//     const decoded = await request.jwtVerify<JwtPayload>();
//     request.user = decoded;
//   } catch (err) {
//     reply.status(401).send({ error: "Unauthorized", message: "Invalid or expired token" });
//   }
// }

// /**
//  * Authorization middleware factory - checks for specific roles
//  */
// export function authorize(...allowedRoles: Role[]) {
//   return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
//     if (!request.user) {
//       reply.status(401).send({ error: "Unauthorized", message: "Authentication required" });
//       return;
//     }

//     if (!allowedRoles.includes(request.user.role)) {
//       reply.status(403).send({ error: "Forbidden", message: "Insufficient permissions" });
//       return;
//     }
//   };
// }

// /**
//  * Simple password hashing (for demo purposes)
//  * In production, use bcrypt or argon2
//  */
// export async function hashPassword(password: string): Promise<string> {
//   const encoder = new TextEncoder();
//   const data = encoder.encode(password + "ticketchain-salt");
//   const hashBuffer = await crypto.subtle.digest("SHA-256", data);
//   const hashArray = Array.from(new Uint8Array(hashBuffer));
//   return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
// }

// /**
//  * Verify password against hash
//  */
// export async function verifyPassword(password: string, hash: string): Promise<boolean> {
//   const passwordHash = await hashPassword(password);
//   return passwordHash === hash;
// }

import { FastifyRequest, FastifyReply } from "fastify";
import { Role } from "@prisma/client";
import crypto from "crypto";



export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
  walletAddress?: string;
}

// Extend FastifyRequest to include user
declare module "fastify" {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}


export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const decoded = await request.jwtVerify<JwtPayload>();
    request.user = decoded;
  } catch (err) {
    reply.status(401).send({ error: "Unauthorized", message: "Invalid or expired token" });
  }
}


export function authorize(...allowedRoles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      reply.status(401).send({ error: "Unauthorized", message: "Authentication required" });
      return;
    }

    if (!allowedRoles.includes(request.user.role)) {
      reply.status(403).send({ error: "Forbidden", message: "Insufficient permissions" });
      return;
    }
  };
}


const SALT = "ticketchain-salt"; // simple demo salt – replace with secure random salt in production


export async function hashPassword(password: string): Promise<string> {
  return crypto
    .createHash("sha256")
    .update(password + SALT)
    .digest("hex");
}


export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}