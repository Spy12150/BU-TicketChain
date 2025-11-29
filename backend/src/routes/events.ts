import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authorize } from "../lib/auth.js";
import { createEventOnChain, getEventFromChain, ethers } from "../lib/blockchain.js";

// Validation schemas
const createEventSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  price: z.string(), // Wei as string
  discountedPrice: z.string(), // Wei as string
  maxSupply: z.number().int().positive(),
  startTime: z.string().datetime(), // ISO 8601
  endTime: z.string().datetime(),
  venue: z.string().optional(),
  imageUrl: z.string().url().optional(),
});

export async function eventsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /events - List all events
   * Public endpoint
   */
  fastify.get("/", async (_request: FastifyRequest, reply: FastifyReply) => {
    const events = await prisma.event.findMany({
      orderBy: { startTime: "asc" },
      select: {
        id: true,
        onChainEventId: true,
        name: true,
        description: true,
        price: true,
        discountedPrice: true,
        maxSupply: true,
        totalSold: true,
        startTime: true,
        endTime: true,
        venue: true,
        imageUrl: true,
      },
    });

    // Calculate remaining tickets and format prices
    const eventsWithMeta = events.map((event) => ({
      ...event,
      remaining: event.maxSupply - event.totalSold,
      priceEth: ethers.formatEther(event.price),
      discountedPriceEth: ethers.formatEther(event.discountedPrice),
      isUpcoming: new Date(event.startTime) > new Date(),
      isOngoing:
        new Date(event.startTime) <= new Date() && new Date(event.endTime) > new Date(),
      hasEnded: new Date(event.endTime) <= new Date(),
    }));

    return reply.send({ events: eventsWithMeta });
  });

  /**
   * GET /events/:id - Get single event details
   * Public endpoint
   */
  fastify.get("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        _count: {
          select: { tickets: true },
        },
      },
    });

    if (!event) {
      return reply.status(404).send({ error: "Event not found" });
    }

    // Try to get fresh data from chain
    let chainData = null;
    try {
      chainData = await getEventFromChain(event.onChainEventId);
    } catch {
      // Chain might not be available, use DB data
    }

    return reply.send({
      ...event,
      remaining: event.maxSupply - event.totalSold,
      priceEth: ethers.formatEther(event.price),
      discountedPriceEth: ethers.formatEther(event.discountedPrice),
      chainData: chainData
        ? {
            totalSold: Number(chainData.totalSold),
            remaining: Number(chainData.maxSupply - chainData.totalSold),
          }
        : null,
    });
  });

  /**
   * POST /events - Create a new event
   * Admin only - creates on-chain and in DB
   */
  fastify.post(
    "/",
    { preHandler: [fastify.authenticate, authorize("ADMIN")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = createEventSchema.parse(request.body);

        const startTime = Math.floor(new Date(body.startTime).getTime() / 1000);
        const endTime = Math.floor(new Date(body.endTime).getTime() / 1000);

        // Create event on-chain first
        let onChainEventId: number;
        let txHash: string;

        try {
          const result = await createEventOnChain(
            body.name,
            BigInt(body.price),
            BigInt(body.discountedPrice),
            body.maxSupply,
            startTime,
            endTime
          );
          onChainEventId = result.eventId;
          txHash = result.txHash;
        } catch (chainError) {
          console.error("Failed to create event on-chain:", chainError);
          return reply.status(500).send({
            error: "Blockchain error",
            message: "Failed to create event on-chain. Please try again.",
          });
        }

        // Create event in DB
        const event = await prisma.event.create({
          data: {
            onChainEventId,
            name: body.name,
            description: body.description,
            price: body.price,
            discountedPrice: body.discountedPrice,
            maxSupply: body.maxSupply,
            startTime: new Date(body.startTime),
            endTime: new Date(body.endTime),
            venue: body.venue,
            imageUrl: body.imageUrl,
          },
        });

        // Record the transaction
        await prisma.transaction.create({
          data: {
            txHash,
            type: "PURCHASE", // Using PURCHASE as placeholder, should add EVENT_CREATE type
            eventId: event.id,
            userId: request.user!.userId,
            status: "CONFIRMED",
            confirmedAt: new Date(),
          },
        });

        return reply.status(201).send({
          message: "Event created successfully",
          event: {
            ...event,
            priceEth: ethers.formatEther(event.price),
            discountedPriceEth: ethers.formatEther(event.discountedPrice),
          },
          txHash,
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
   * GET /events/:id/stats - Get event statistics
   * Admin only
   */
  fastify.get(
    "/:id/stats",
    { preHandler: [fastify.authenticate, authorize("ADMIN")] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      const event = await prisma.event.findUnique({
        where: { id },
      });

      if (!event) {
        return reply.status(404).send({ error: "Event not found" });
      }

      // Get ticket stats
      const ticketStats = await prisma.ticket.groupBy({
        by: ["status"],
        where: { eventId: id },
        _count: { id: true },
      });

      // Get transaction stats
      const transactions = await prisma.transaction.findMany({
        where: { eventId: id },
        select: { amount: true, type: true, status: true },
      });

      const totalRevenue = transactions
        .filter((t) => t.type === "PURCHASE" && t.status === "CONFIRMED" && t.amount)
        .reduce((sum, t) => sum + BigInt(t.amount || "0"), BigInt(0));

      return reply.send({
        event: {
          id: event.id,
          name: event.name,
          maxSupply: event.maxSupply,
          totalSold: event.totalSold,
          remaining: event.maxSupply - event.totalSold,
        },
        tickets: ticketStats.reduce(
          (acc, stat) => {
            acc[stat.status.toLowerCase()] = stat._count.id;
            return acc;
          },
          {} as Record<string, number>
        ),
        revenue: {
          totalWei: totalRevenue.toString(),
          totalEth: ethers.formatEther(totalRevenue),
        },
      });
    }
  );
}

