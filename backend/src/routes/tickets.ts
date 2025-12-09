import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authorize } from "../lib/auth.js";
import { verifyTicketOnChain, ethers } from "../lib/blockchain.js";
import crypto from "crypto";
import { parseTicketUID } from "../lib/parseTicketUID.js";

// Validation schemas
const buyTicketSchema = z.object({
  eventId: z.string(), // DB event ID
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  pricePaid: z.string(), // Wei as string
});

const transferTicketSchema = z.object({
  ticketId: z.string(),
  toAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

const refundTicketSchema = z.object({
  ticketId: z.string(),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

// const verifyTicketSchema = z.object({
//   eventId: z.number().int().positive(),
//   ticketSerial: z.number().int().nonnegative(),
//   holderAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
//   nonce: z.string(),
//   signature: z.string().optional(),
// });
const verifyTicketSchema = z.object({
  eventId: z.number().int().nonnegative(),
  ticketSerial: z.number().int().nonnegative(),
  // holderAddress is no longer required from client; we will use the owner on record
  holderAddress: z.string().optional(),
  nonce: z.string().optional(),
  signature: z.string().optional(),
});

export async function ticketsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /tickets/me - Get current user's tickets
   * Requires authentication
   */
  fastify.get(
    "/me",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.userId;

      // Get user's wallet addresses
      const userWallets = await prisma.wallet.findMany({
        where: { userId },
        select: { address: true },
      });
      const walletAddresses = userWallets.map((w) => w.address.toLowerCase());

      // Query tickets by BOTH userId AND wallet addresses
      // This ensures tickets transferred to user's wallet are shown
      const tickets = await prisma.ticket.findMany({
        where: {
          OR: [
            { ownerUserId: userId },
            ...(walletAddresses.length > 0
              ? [{ ownerAddress: { in: walletAddresses } }]
              : []),
          ],
        },
        include: {
          event: {
            select: {
              id: true,
              onChainEventId: true,
              name: true,
              startTime: true,
              endTime: true,
              venue: true,
              imageUrl: true,
            },
          },
        },
        orderBy: { purchasedAt: "desc" },
      });

      // Add QR code payload for each valid ticket
      const ticketsWithQR = tickets.map((ticket) => {
        const qrPayload =
          ticket.status === "VALID"
            ? generateQRPayload(
                ticket.event.onChainEventId,
                ticket.ticketSerial,
                ticket.ownerAddress
              )
            : null;

        return {
          id: ticket.id,
          eventId: ticket.eventId,
          onChainEventId: ticket.event.onChainEventId,
          eventName: ticket.event.name,
          ticketSerial: ticket.ticketSerial,
          status: ticket.status,
          ownerAddress: ticket.ownerAddress,
          purchasedAt: ticket.purchasedAt,
          usedAt: ticket.usedAt,
          event: ticket.event,
          qrPayload,
        };
      });

      return reply.send({ tickets: ticketsWithQR });
    }
  );

  /**
   * POST /tickets/buy - Record a ticket purchase
   * Called after on-chain buyTicket succeeds
   */
  fastify.post(
    "/buy",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = buyTicketSchema.parse(request.body);
        const userId = request.user!.userId;

        // Find the event
        const event = await prisma.event.findUnique({
          where: { id: body.eventId },
        });

        if (!event) {
          return reply.status(404).send({ error: "Event not found" });
        }

        // Check if transaction already recorded
        const existingTx = await prisma.transaction.findUnique({
          where: { txHash: body.txHash },
        });

        if (existingTx) {
          return reply.status(409).send({ error: "Transaction already recorded" });
        }

        // Get next ticket serial (in production, parse from chain event)
        const lastTicket = await prisma.ticket.findFirst({
          where: { eventId: body.eventId },
          orderBy: { ticketSerial: "desc" },
        });
        const ticketSerial = (lastTicket?.ticketSerial ?? -1) + 1;

        // Create ticket and transaction in a transaction
        const result = await prisma.$transaction(async (tx) => {
          // Create ticket
          const ticket = await tx.ticket.create({
            data: {
              eventId: body.eventId,
              ownerUserId: userId,
              ownerAddress: body.walletAddress.toLowerCase(),
              ticketSerial,
              status: "VALID",
            },
          });

          // Record transaction
          const transaction = await tx.transaction.create({
            data: {
              txHash: body.txHash,
              type: "PURCHASE",
              userId,
              eventId: body.eventId,
              ticketId: ticket.id,
              toAddress: body.walletAddress.toLowerCase(),
              amount: body.pricePaid,
              status: "CONFIRMED",
              confirmedAt: new Date(),
            },
          });

          // Update event sold count
          await tx.event.update({
            where: { id: body.eventId },
            data: { totalSold: { increment: 1 } },
          });

          return { ticket, transaction };
        });

        return reply.status(201).send({
          message: "Ticket purchase recorded",
          ticket: {
            id: result.ticket.id,
            eventId: result.ticket.eventId,
            ticketSerial: result.ticket.ticketSerial,
            status: result.ticket.status,
          },
          txHash: body.txHash,
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
   * POST /tickets/transfer - Record a ticket transfer
   */
  fastify.post(
    "/transfer",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = transferTicketSchema.parse(request.body);
        const userId = request.user!.userId;

        // Find the ticket
        const ticket = await prisma.ticket.findUnique({
          where: { id: body.ticketId },
          include: { event: true },
        });

        if (!ticket) {
          return reply.status(404).send({ error: "Ticket not found" });
        }

        if (ticket.ownerUserId !== userId) {
          return reply.status(403).send({ error: "Not the ticket owner" });
        }

        if (ticket.status !== "VALID") {
          return reply.status(400).send({ error: "Ticket cannot be transferred" });
        }

        // Find recipient user by wallet address
        const recipientWallet = await prisma.wallet.findUnique({
          where: { address: body.toAddress.toLowerCase() },
          include: { user: true },
        });

        // Update ticket and record transaction
        const result = await prisma.$transaction(async (tx) => {
          // Update ownership in-place (ticket remains VALID, just changes owner)
          const updatedTicket = await tx.ticket.update({
            where: { id: body.ticketId },
            data: {
              ownerUserId: recipientWallet?.userId || null,
              ownerAddress: body.toAddress.toLowerCase(),
              status: "VALID",
            },
          });

          // Record transaction
          const transaction = await tx.transaction.create({
            data: {
              txHash: body.txHash,
              type: "TRANSFER",
              userId,
              eventId: ticket.eventId,
              ticketId: updatedTicket.id,
              fromAddress: ticket.ownerAddress,
              toAddress: body.toAddress.toLowerCase(),
              status: "CONFIRMED",
              confirmedAt: new Date(),
            },
          });

          return { updatedTicket, transaction };
        });

        return reply.send({
          message: "Ticket transfer recorded",
          ticket: {
            id: result.updatedTicket.id,
            newOwner: body.toAddress,
            status: result.updatedTicket.status,
          },
          txHash: body.txHash,
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
   * POST /tickets/refund - Record a ticket refund
   */
  fastify.post(
    "/refund",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = refundTicketSchema.parse(request.body);
        const userId = request.user!.userId;

        // Find the ticket
        const ticket = await prisma.ticket.findUnique({
          where: { id: body.ticketId },
          include: { event: true },
        });

        if (!ticket) {
          return reply.status(404).send({ error: "Ticket not found" });
        }

        if (ticket.ownerUserId !== userId) {
          return reply.status(403).send({ error: "Not the ticket owner" });
        }

        if (ticket.status !== "VALID") {
          return reply.status(400).send({ error: "Ticket cannot be refunded" });
        }

        // Check if event hasn't started
        if (new Date() >= ticket.event.startTime) {
          return reply.status(400).send({ error: "Cannot refund after event starts" });
        }

        // Update ticket and record transaction
        const result = await prisma.$transaction(async (tx) => {
          const updatedTicket = await tx.ticket.update({
            where: { id: body.ticketId },
            data: { status: "REFUNDED" },
          });

          const transaction = await tx.transaction.create({
            data: {
              txHash: body.txHash,
              type: "REFUND",
              userId,
              eventId: ticket.eventId,
              ticketId: ticket.id,
              fromAddress: ticket.ownerAddress,
              status: "CONFIRMED",
              confirmedAt: new Date(),
            },
          });

          // Decrement sold count
          await tx.event.update({
            where: { id: ticket.eventId },
            data: { totalSold: { decrement: 1 } },
          });

          return { updatedTicket, transaction };
        });

        return reply.send({
          message: "Ticket refund recorded",
          ticket: {
            id: result.updatedTicket.id,
            status: result.updatedTicket.status,
          },
          txHash: body.txHash,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: "Validation error", details: error.errors });
        }
        throw error;
      }
    }
  );

//   /**
//    * POST /tickets/verify - Verify a ticket (for venue entry)
//    * Used by verifier role to scan QR codes
//    */
//   fastify.post(
//     "/verify",
//     { preHandler: [fastify.authenticate, authorize("VERIFIER", "ADMIN")] },
//     async (request: FastifyRequest, reply: FastifyReply) => {
//       try {
//         const body = verifyTicketSchema.parse(request.body);

//         // Find event by on-chain ID
//         const event = await prisma.event.findUnique({
//           where: { onChainEventId: body.eventId },
//         });

//         if (!event) {
//           return reply.send({
//             valid: false,
//             reason: "Event not found",
//           });
//         }

//         // Find ticket in DB
//         const ticket = await prisma.ticket.findUnique({
//           where: {
//             eventId_ticketSerial: {
//               eventId: event.id,
//               ticketSerial: body.ticketSerial,
//             },
//           },
//           include: { owner: true },
//         });

//         if (!ticket) {
//           return reply.send({
//             valid: false,
//             reason: "Ticket not found",
//           });
//         }

//         // Check DB status
//         if (ticket.status === "USED") {
//           return reply.send({
//             valid: false,
//             reason: "Ticket already used",
//             usedAt: ticket.usedAt,
//           });
//         }

//         if (ticket.status !== "VALID") {
//           return reply.send({
//             valid: false,
//             reason: `Ticket status: ${ticket.status}`,
//           });
//         }

//         // Verify ownership matches
//         if (ticket.ownerAddress.toLowerCase() !== body.holderAddress.toLowerCase()) {
//           return reply.send({
//             valid: false,
//             reason: "Holder address mismatch",
//           });
//         }

//         // Also verify on-chain
//         let chainVerification = { valid: false, used: false, balance: BigInt(0) };
//         try {
//           chainVerification = await verifyTicketOnChain(
//             body.eventId,
//             body.ticketSerial,
//             body.holderAddress
//           );
//         } catch {
//           // Chain verification failed, rely on DB
//           console.warn("On-chain verification failed, using DB data");
//         }

//         // If chain says invalid or used, trust chain
//         if (chainVerification.used) {
//           // Mark as used in DB too
//           await prisma.ticket.update({
//             where: { id: ticket.id },
//             data: { status: "USED", usedAt: new Date() },
//           });

//           return reply.send({
//             valid: false,
//             reason: "Ticket marked as used on-chain",
//           });
//         }

//         // All checks passed - ticket is valid
//         return reply.send({
//           valid: true,
//           ticket: {
//             id: ticket.id,
//             eventName: event.name,
//             ticketSerial: ticket.ticketSerial,
//             holderAddress: ticket.ownerAddress,
//             ownerName: ticket.owner?.email || "Unknown",
//           },
//           chainVerified: chainVerification.valid,
//         });
//       } catch (error) {
//         if (error instanceof z.ZodError) {
//           return reply.status(400).send({ error: "Validation error", details: error.errors });
//         }
//         throw error;
//       }
//     }
//   );

  /**
   * POST /tickets/mark-used - Mark a ticket as used after verification
   * Used by verifier role
   */
  fastify.post(
    "/mark-used",
    { preHandler: [fastify.authenticate, authorize("VERIFIER", "ADMIN")] },
    async (
      request: FastifyRequest<{ Body: { ticketId: string } }>,
      reply: FastifyReply
    ) => {
      const { ticketId } = request.body;

      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
      });

      if (!ticket) {
        return reply.status(404).send({ error: "Ticket not found" });
      }

      if (ticket.status !== "VALID") {
        return reply.status(400).send({ error: "Ticket is not valid" });
      }

      const updatedTicket = await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          status: "USED",
          usedAt: new Date(),
        },
      });

      return reply.send({
        message: "Ticket marked as used",
        ticket: {
          id: updatedTicket.id,
          status: updatedTicket.status,
          usedAt: updatedTicket.usedAt,
        },
      });
    }
  );


fastify.post(
  "/verify",
  { preHandler: [fastify.authenticate, authorize("VERIFIER", "ADMIN")] },
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      let body = request.body as any;

      // NEW: If verifier sends UID (TKT-2-0003)
      if (body.ticketUID) {
        const parsed = parseTicketUID(body.ticketUID);
        if (!parsed) {
          return reply.send({
            valid: false,
            reason: "Invalid UID format",
          });
        }

        // rewrite body to match existing schema
        body.eventId = parsed.eventId;
        body.ticketSerial = parsed.ticketSerial;
      }

      // Validate (still uses your Zod schema)
      body = verifyTicketSchema.parse(body);

      // 1. Lookup event from on-chain ID (use findFirst since onChainEventId is not unique)
      const event = await prisma.event.findFirst({
        where: { onChainEventId: body.eventId },
        orderBy: { createdAt: "desc" }, // Get the most recent event with this ID
      });

      if (!event) {
        return reply.send({ valid: false, reason: "Event not found" });
      }

      // 2. Lookup ticket by DB serial + event UUID
      const ticket = await prisma.ticket.findUnique({
        where: {
          eventId_ticketSerial: {
            eventId: event.id,
            ticketSerial: body.ticketSerial,
          },
        },
        include: { owner: true },
      });

      if (!ticket) {
        return reply.send({ valid: false, reason: "Ticket not found" });
      }

      // 3. Local status checks
      if (ticket.status === "USED") {
        return reply.send({
          valid: false,
          reason: "Ticket already used",
          usedAt: ticket.usedAt,
        });
      }

      if (ticket.status !== "VALID") {
        return reply.send({
          valid: false,
          reason: `Ticket status: ${ticket.status}`,
        });
      }

      // 4. On-chain verification using the owner address on record
      let chainVerification = { valid: false, used: false, balance: BigInt(0) };
      try {
        chainVerification = await verifyTicketOnChain(
          body.eventId,
          body.ticketSerial,
          ticket.ownerAddress
        );
      } catch {
        console.warn("On-chain verification failed, using DB only");
      }

      if (chainVerification.used) {
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { status: "USED", usedAt: new Date() },
        });

        return reply.send({
          valid: false,
          reason: "Ticket marked as used on-chain",
        });
      }

      // 6. Final success response
      return reply.send({
        valid: true,
        ticket: {
          id: ticket.id,
          eventName: event.name,
          ticketSerial: ticket.ticketSerial,
          holderAddress: ticket.ownerAddress,
          ownerName: ticket.owner?.email || "Unknown",
        },
        chainVerified: chainVerification.valid,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply
          .status(400)
          .send({ error: "Validation error", details: error.errors });
      }
      throw error;
    }
  }
);

/**
 * Generate QR code payload for a ticket
 */
function generateQRPayload(
  onChainEventId: number,
  ticketSerial: number,
  holderAddress: string
): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = {
    eventId: onChainEventId,
    ticketSerial,
    holderAddress,
    nonce,
    timestamp: Date.now(),
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}
}
