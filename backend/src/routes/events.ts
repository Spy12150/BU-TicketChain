// import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
// import { z } from "zod";
// import prisma from "../lib/prisma.js";
// import { authorize } from "../lib/auth.js";
// import { createEventOnChain, getEventFromChain, ethers } from "../lib/blockchain.js";

// // Validation schemas
// const createEventSchema = z.object({
//   name: z.string().min(1).max(200),
//   description: z.string().optional(),
//   price: z.string(), // Wei as string
//   discountedPrice: z.string(), // Wei as string
//   maxSupply: z.number().int().positive(),
//   startTime: z.string().datetime(), // ISO 8601
//   endTime: z.string().datetime(),
//   venue: z.string().optional(),
//   imageUrl: z.string().url().optional(),
// });

// export async function eventsRoutes(fastify: FastifyInstance): Promise<void> {
//   /**
//    * GET /events - List all events
//    * Public endpoint
//    */
//   fastify.get("/", async (_request: FastifyRequest, reply: FastifyReply) => {
//     const events = await prisma.event.findMany({
//       orderBy: { startTime: "asc" },
//       select: {
//         id: true,
//         onChainEventId: true,
//         name: true,
//         description: true,
//         price: true,
//         discountedPrice: true,
//         maxSupply: true,
//         totalSold: true,
//         startTime: true,
//         endTime: true,
//         venue: true,
//         imageUrl: true,
//       },
//     });

//     // Calculate remaining tickets and format prices
//     const eventsWithMeta = events.map((event) => ({
//       ...event,
//       remaining: event.maxSupply - event.totalSold,
//       priceEth: ethers.formatEther(event.price),
//       discountedPriceEth: ethers.formatEther(event.discountedPrice),
//       isUpcoming: new Date(event.startTime) > new Date(),
//       isOngoing:
//         new Date(event.startTime) <= new Date() && new Date(event.endTime) > new Date(),
//       hasEnded: new Date(event.endTime) <= new Date(),
//     }));

//     return reply.send({ events: eventsWithMeta });
//   });

//   /**
//    * GET /events/:id - Get single event details
//    * Public endpoint
//    */
//   fastify.get("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
//     const { id } = request.params;

//     const event = await prisma.event.findUnique({
//       where: { id },
//       include: {
//         _count: {
//           select: { tickets: true },
//         },
//       },
//     });

//     if (!event) {
//       return reply.status(404).send({ error: "Event not found" });
//     }

//     // Try to get fresh data from chain
//     let chainData = null;
//     try {
//       chainData = await getEventFromChain(event.onChainEventId);
//     } catch {
//       // Chain might not be available, use DB data
//     }

//     // Calculate status based on current time
//     const now = new Date();
//     const isUpcoming = new Date(event.startTime) > now;
//     const isOngoing = new Date(event.startTime) <= now && new Date(event.endTime) > now;
//     const hasEnded = new Date(event.endTime) <= now;

//     return reply.send({
//       ...event,
//       remaining: event.maxSupply - event.totalSold,
//       priceEth: ethers.formatEther(event.price),
//       discountedPriceEth: ethers.formatEther(event.discountedPrice),
//       isUpcoming,
//       isOngoing,
//       hasEnded,
//       chainData: chainData
//         ? {
//             totalSold: Number(chainData.totalSold),
//             remaining: Number(chainData.maxSupply - chainData.totalSold),
//           }
//         : null,
//     });
//   });

//   /**
//    * POST /events - Create a new event
//    * Admin only - creates on-chain and in DB
//    */
//   fastify.post(
//     "/",
//     { preHandler: [fastify.authenticate, authorize("ADMIN")] },
//     async (request: FastifyRequest, reply: FastifyReply) => {
//       try {
//         const body = createEventSchema.parse(request.body);

//         const startTime = Math.floor(new Date(body.startTime).getTime() / 1000);
//         const endTime = Math.floor(new Date(body.endTime).getTime() / 1000);

//         // Create event on-chain first
//         let onChainEventId: number;
//         let txHash: string;

//         try {
//           const result = await createEventOnChain(
//             body.name,
//             BigInt(body.price),
//             BigInt(body.discountedPrice),
//             body.maxSupply,
//             startTime,
//             endTime
//           );
//           onChainEventId = result.eventId;
//           txHash = result.txHash;
//         } catch (chainError) {
//           console.error("Failed to create event on-chain:", chainError);
//           return reply.status(500).send({
//             error: "Blockchain error",
//             message: "Failed to create event on-chain. Please try again.",
//           });
//         }

//         // Create event in DB
//         const event = await prisma.event.create({
//           data: {
//             onChainEventId,
//             name: body.name,
//             description: body.description,
//             price: body.price,
//             discountedPrice: body.discountedPrice,
//             maxSupply: body.maxSupply,
//             startTime: new Date(body.startTime),
//             endTime: new Date(body.endTime),
//             venue: body.venue,
//             imageUrl: body.imageUrl,
//           },
//         });

//         // Record the transaction
//         await prisma.transaction.create({
//           data: {
//             txHash,
//             type: "PURCHASE", // Using PURCHASE as placeholder, should add EVENT_CREATE type
//             eventId: event.id,
//             userId: request.user!.userId,
//             status: "CONFIRMED",
//             confirmedAt: new Date(),
//           },
//         });

//         return reply.status(201).send({
//           message: "Event created successfully",
//           event: {
//             ...event,
//             priceEth: ethers.formatEther(event.price),
//             discountedPriceEth: ethers.formatEther(event.discountedPrice),
//           },
//           txHash,
//         });
//       } catch (error) {
//         if (error instanceof z.ZodError) {
//           return reply.status(400).send({ error: "Validation error", details: error.errors });
//         }
//         throw error;
//       }
//     }
//   );

//   /**
//    * GET /events/:id/stats - Get event statistics
//    * Admin only
//    */
//   fastify.get(
//     "/:id/stats",
//     { preHandler: [fastify.authenticate, authorize("ADMIN")] },
//     async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
//       const { id } = request.params;

//       const event = await prisma.event.findUnique({
//         where: { id },
//       });

//       if (!event) {
//         return reply.status(404).send({ error: "Event not found" });
//       }

//       // Get ticket stats
//       const ticketStats = await prisma.ticket.groupBy({
//         by: ["status"],
//         where: { eventId: id },
//         _count: { id: true },
//       });

//       // Get all tickets with buyer info for this event
//       const ticketPurchases = await prisma.ticket.findMany({
//         where: { eventId: id },
//         include: {
//           owner: {
//             select: {
//               id: true,
//               email: true,
//               buId: true,
//             },
//           },
//           transactions: {
//             where: { type: "PURCHASE" },
//             select: {
//               txHash: true,
//               amount: true,
//               createdAt: true,
//               confirmedAt: true,
//             },
//             take: 1,
//           },
//         },
//         orderBy: { purchasedAt: "desc" },
//       });

//       // Get transaction stats
//       const transactions = await prisma.transaction.findMany({
//         where: { eventId: id },
//         select: { amount: true, type: true, status: true },
//       });

//       const totalRevenue = transactions
//         .filter((t) => t.type === "PURCHASE" && t.status === "CONFIRMED" && t.amount)
//         .reduce((sum, t) => sum + BigInt(t.amount || "0"), BigInt(0));

//       // Format ticket purchases for admin view
//       const purchases = ticketPurchases.map((ticket) => ({
//         ticketId: ticket.id,
//         ticketSerial: ticket.ticketSerial,
//         ticketUID: `TKT-${event.onChainEventId}-${ticket.ticketSerial.toString().padStart(4, "0")}`,
//         status: ticket.status,
//         buyerAddress: ticket.ownerAddress,
//         buyerEmail: ticket.owner?.email || null,
//         buyerBuId: ticket.owner?.buId || null,
//         purchasedAt: ticket.purchasedAt.toISOString(),
//         txHash: ticket.transactions[0]?.txHash || null,
//         pricePaid: ticket.transactions[0]?.amount 
//           ? ethers.formatEther(ticket.transactions[0].amount) + " ETH"
//           : null,
//       }));

//       return reply.send({
//         event: {
//           id: event.id,
//           name: event.name,
//           maxSupply: event.maxSupply,
//           totalSold: event.totalSold,
//           remaining: event.maxSupply - event.totalSold,
//         },
//         tickets: ticketStats.reduce(
//           (acc, stat) => {
//             acc[stat.status.toLowerCase()] = stat._count.id;
//             return acc;
//           },
//           {} as Record<string, number>
//         ),
//         revenue: {
//           totalWei: totalRevenue.toString(),
//           totalEth: ethers.formatEther(totalRevenue),
//         },
//         purchases, // NEW: List of all purchases with buyer details
//       });
//     }
//   );
// }


import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authorize } from "../lib/auth.js";
import { createEventOnChain, getEventFromChain, ethers } from "../lib/blockchain.js";

// Validation schemas
const createEventSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  price: z.string(),
  discountedPrice: z.string(),
  maxSupply: z.number().int().positive(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  venue: z.string().optional(),
  imageUrl: z.string().url().optional(),
});

export async function eventsRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * GET /events - List all events
   */
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

  /**
   * GET /events/:id - Get single event details
   */
  fastify.get("/:id", async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
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
    } catch {}

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

  /**
   * POST /events - Create a new event
   * Admin only
   */
  fastify.post(
    "/",
    { preHandler: [fastify.authenticate, authorize("ADMIN")] },
    async (req, reply) => {
      try {
        const body = createEventSchema.parse(req.body);

        const startTimestamp = Math.floor(new Date(body.startTime).getTime() / 1000);
        const endTimestamp = Math.floor(new Date(body.endTime).getTime() / 1000);

        let onChainEventId = 0;
        let txHash = "";

        try {
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
        } catch (e) {
          console.error("Blockchain error:", e);
          return reply.status(500).send({ error: "Blockchain error" });
        }

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
            userId: req.user!.userId,
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
      } catch (e) {
        return reply.status(400).send({ error: "Validation error" });
      }
    }
  );

  /**
   * GET /events/:id/stats - Admin view of event statistics
   * Includes buyer list 
   */
  fastify.get(
    "/:id/stats",
    { preHandler: [fastify.authenticate, authorize("ADMIN")] },
    async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const { id } = req.params;

      const event = await prisma.event.findUnique({ where: { id } });
      if (!event) return reply.status(404).send({ error: "Event not found" });

      // Ticket stats
      const ticketStats = await prisma.ticket.groupBy({
        by: ["status"],
        where: { eventId: id },
        _count: { id: true },
      });

      // Fetch detailed purchase history (buyer list)
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

      const purchases = ticketPurchases.map((t) => ({
        ticketId: t.id,
        ticketSerial: t.ticketSerial,
        status: true,
        buyerAddress: t.ownerAddress,
        buyerEmail: t.owner?.email || null,
        buyerBuId: t.owner?.buId || null,
        purchasedAt: t.purchasedAt,
        txHash: t.transactions[0]?.txHash || null,
        pricePaid: t.transactions[0]?.amount
          ? ethers.formatEther(t.transactions[0].amount)
          : null,
      }));

      const totalRevenue = ticketPurchases.reduce((sum, t) => {
        const amount = t.transactions[0]?.amount;
        return sum + (amount ? BigInt(amount) : BigInt(0));
      }, BigInt(0));

      return reply.send({
        event: {
          id: event.id,
          name: event.name,
          maxSupply: event.maxSupply,
          totalSold: event.totalSold,
          remaining: event.maxSupply - event.totalSold,
        },
        tickets: ticketStats.reduce((acc, stat) => {
          acc[stat.status.toLowerCase()] = stat._count.id;
          return acc;
        }, {} as Record<string, number>),
        revenue: {
          totalWei: totalRevenue.toString(),
          totalEth: ethers.formatEther(totalRevenue),
        },
        purchases, 
      });
    }
  );

} // END eventsRoutes