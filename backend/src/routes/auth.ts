import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/auth.js";
import { Role } from "@prisma/client";

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  buId: z.string().optional(),
  role: z.enum(["USER", "ADMIN", "VERIFIER"]).optional().default("USER"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const linkWalletSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
});

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /auth/register - Register a new user
   */
  fastify.post("/register", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = registerSchema.parse(request.body);

      // Check if user already exists
      const existing = await prisma.user.findFirst({
        where: {
          OR: [{ email: body.email }, body.buId ? { buId: body.buId } : {}],
        },
      });

      if (existing) {
        return reply.status(409).send({ error: "User already exists" });
      }

      // Create user
      const passwordHash = await hashPassword(body.password);
      const user = await prisma.user.create({
        data: {
          email: body.email,
          buId: body.buId,
          passwordHash,
          role: body.role as Role,
          // BU students/faculty get discount eligibility
          discountEligible: body.buId ? true : false,
        },
      });

      // Generate JWT
      const token = fastify.jwt.sign({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      return reply.status(201).send({
        message: "User registered successfully",
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          discountEligible: user.discountEligible,
        },
        token,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: "Validation error", details: error.errors });
      }
      throw error;
    }
  });

  /**
   * POST /auth/login - Login with email and password
   */
  fastify.post("/login", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = loginSchema.parse(request.body);

      // Find user
      const user = await prisma.user.findUnique({
        where: { email: body.email },
        include: { wallets: { where: { isPrimary: true } } },
      });

      if (!user) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      // Verify password
      const valid = await verifyPassword(body.password, user.passwordHash);
      if (!valid) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      // Generate JWT
      const token = fastify.jwt.sign({
        userId: user.id,
        email: user.email,
        role: user.role,
        walletAddress: user.wallets[0]?.address,
      });

      return reply.send({
        message: "Login successful",
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          discountEligible: user.discountEligible,
          walletAddress: user.wallets[0]?.address,
        },
        token,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: "Validation error", details: error.errors });
      }
      throw error;
    }
  });

  /**
   * POST /auth/link-wallet - Link a wallet address to the user
   * Requires authentication
   */
  fastify.post(
    "/link-wallet",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = linkWalletSchema.parse(request.body);
        const userId = request.user!.userId;

        // Check if wallet already linked to another user
        const existingWallet = await prisma.wallet.findUnique({
          where: { address: body.address.toLowerCase() },
        });

        if (existingWallet && existingWallet.userId !== userId) {
          return reply.status(409).send({ error: "Wallet already linked to another user" });
        }

        // Check if user already has this wallet
        if (existingWallet && existingWallet.userId === userId) {
          return reply.send({ message: "Wallet already linked", wallet: existingWallet });
        }

        // Link wallet
        const wallet = await prisma.wallet.create({
          data: {
            userId,
            address: body.address.toLowerCase(),
            isPrimary: true,
          },
        });

        // Set other wallets as non-primary
        await prisma.wallet.updateMany({
          where: {
            userId,
            id: { not: wallet.id },
          },
          data: { isPrimary: false },
        });

        return reply.status(201).send({
          message: "Wallet linked successfully",
          wallet: {
            id: wallet.id,
            address: wallet.address,
            isPrimary: wallet.isPrimary,
          },
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: "Validation error", details: error.errors });
        }
        throw error;
      }
    }
  );

  /**
   * GET /auth/me - Get current user info
   * Requires authentication
   */
  fastify.get(
    "/me",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.user!.userId },
        include: { wallets: true },
      });

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      return reply.send({
        id: user.id,
        email: user.email,
        buId: user.buId,
        role: user.role,
        discountEligible: user.discountEligible,
        wallets: user.wallets.map((w) => ({
          id: w.id,
          address: w.address,
          isPrimary: w.isPrimary,
        })),
      });
    }
  );
}

