// @ts-nocheck
import { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authorize } from "../lib/auth.js";
import { createEventOnChain, getEventFromChain, ethers } from "../lib/blockchain.js";

const createEventSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().optional(),
    price: z.string(), // wei string
    discountedPrice: z.string(), // wei string
    maxSupply: z.number().int().positive(),
    startTime: z.string().datetime(), // ISO 8601
    endTime: z.string().datetime(),
    venue: z.string().optional(),
    imageUrl: z.string().url().optional(),
  })
  .refine(
    (data) => new Date(data.endTime).getTime() > new Date(data.startTime).getTime(),
    { message: "endTime must be after startTime", path: ["endTime"] }
  );

export async function eventsRoutes(fastify: FastifyInstance): Promise<void> {
  // List events
  fastify.get("/", async (_req, reply) => {
    const events = await prisma.event.findMany({
      orderBy: { startTime: "asc" },
    });

    const now = new Date();

    const eventsWithMeta = events.map((e) => ({
      ...e,
      remaining: e.maxSupply - e.totalSold,
      priceEth: ethers.formatEther(e.price),
      discountedPriceEth: ethers.formatEther(e.discountedPrice),
      isUpcoming: new Date(e.startTime) > now,
      isOngoing: new Date(e.startTime) <= now && new Date(e.endTime) > now,
      hasEnded: new Date(e.endTime) <= now,
    }));

    return reply.send({ events: eventsWithMeta });
  });

  // Get single event
  fastify.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const { id } = req.params;

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        _count: { select: { tickets: true } },
      },
    });

    if (!event) return reply.status(404).send({ error: "Event not found" });

    let chainData = null;
    try {
      chainData = await getEventFromChain(event.onChainEventId);
    } catch {
      // ignore chain failure
    }

    const now = new Date();
    const isUpcoming = new Date(event.startTime) > now;
    const isOngoing = new Date(event.startTime) <= now && new Date(event.endTime) > now;
    const hasEnded = new Date(event.endTime) <= now;

    return reply.send({
      ...event,
      remaining: event.maxSupply - event.totalSold,
      priceEth: ethers.formatEther(event.price),
      discountedPriceEth: ethers.formatEther(event.discountedPrice),
      isUpcoming,
      isOngoing,
      hasEnded,
      chainData: chainData
        ? {
            totalSold: Number(chainData.totalSold),
            remaining: Number(chainData.maxSupply - chainData.totalSold),
          }
        : null,
    });
  });

  // Create event (admin)
  fastify.post(
    "/",
    { preHandler: [fastify.authenticate, authorize("ADMIN")] },
    async (req: any, reply: FastifyReply) => {
      console.log("=== CREATE EVENT REQUEST ===");
      console.log("Request body:", JSON.stringify(req.body, null, 2));
      console.log("User:", req.user);
      
      try {
        const parsed = createEventSchema.safeParse(req.body);
        if (!parsed.success) {
          console.error("Validation error creating event:", parsed.error.flatten());
          return reply.status(400).send({
            error: "Validation error",
            details: parsed.error.flatten(),
          });
        }
        const body = parsed.data;

        const startTimestamp = Math.floor(new Date(body.startTime).getTime() / 1000);
        const endTimestamp = Math.floor(new Date(body.endTime).getTime() / 1000);
        
        console.log("Validation passed. Creating on-chain event...");
        console.log("Timestamps:", { startTimestamp, endTimestamp });

        let onChainEventId = 0;
        let txHash = "";

        try {
          console.log("Calling createEventOnChain...");
          const result = await createEventOnChain(
            body.name,
            BigInt(body.price),
            BigInt(body.discountedPrice),
            body.maxSupply,
            startTimestamp,
            endTimestamp
          );
          onChainEventId = result.eventId;
          txHash = result.txHash;
          console.log("On-chain event created:", { onChainEventId, txHash });
        } catch (e: any) {
          console.error("Blockchain error:", e);
          // Provide more helpful error messages
          let errorMsg = "Blockchain transaction failed";
          if (e?.message?.includes("Ownable")) {
            errorMsg = "Backend wallet is not the contract owner. Check BACKEND_PRIVATE_KEY matches the deployer account.";
          } else if (e?.message?.includes("insufficient funds")) {
            errorMsg = "Backend wallet has insufficient ETH for gas fees.";
          } else if (e?.message) {
            errorMsg = e.message;
          }
          return reply.status(500).send({ error: errorMsg });
        }

        console.log("Creating event in database...");
        
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

        await prisma.transaction.create({
          data: {
            txHash,
            type: "PURCHASE",
            eventId: event.id,
            userId: req.user?.userId ?? null,
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
      } catch (e: any) {
        console.error("Event creation failed:", e);
        const errorMsg = e?.message || String(e) || "Unknown error";
        return reply.status(500).send({ 
          error: "Failed to create event", 
          details: errorMsg 
        });
      }
    }
  );

  // Admin stats
  fastify.get(
    "/:id/stats",
    { preHandler: [fastify.authenticate, authorize("ADMIN")] },
    async (req: any, reply: FastifyReply) => {
      const { id } = req.params;

      const event = await prisma.event.findUnique({ where: { id } });
      if (!event) return reply.status(404).send({ error: "Event not found" });

      const ticketStats = await prisma.ticket.groupBy({
        by: ["status"],
        where: { eventId: id },
        _count: { id: true },
      });

      const ticketPurchases = await prisma.ticket.findMany({
        where: { eventId: id },
        include: {
          owner: { select: { email: true, buId: true } },
          transactions: {
            where: { type: "PURCHASE" },
            take: 1,
          },
        },
        orderBy: { purchasedAt: "desc" },
      });

      const transactions = await prisma.transaction.findMany({
        where: { eventId: id },
        select: { amount: true, type: true, status: true },
      });

      const totalRevenue = transactions
        .filter((t) => t.type === "PURCHASE" && t.status === "CONFIRMED" && t.amount)
        .reduce((sum, t) => sum + BigInt(t.amount || "0"), BigInt(0));

      const purchases = ticketPurchases.map((t) => ({
        ticketId: t.id,
        ticketSerial: t.ticketSerial,
        ticketUID: `TKT-${event.onChainEventId}-${t.ticketSerial.toString().padStart(4, "0")}`,
        status: t.status, // VALID, USED, REFUNDED, TRANSFERRED
        buyerAddress: t.ownerAddress,
        buyerEmail: t.owner?.email || null,
        buyerBuId: t.owner?.buId || null,
        purchasedAt: t.purchasedAt,
        txHash: t.transactions[0]?.txHash || null,
        pricePaid: t.transactions[0]?.amount
          ? ethers.formatEther(t.transactions[0].amount)
          : null,
      }));

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
        purchases,
      });
    }
  );
}

