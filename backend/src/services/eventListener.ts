/**
 * Blockchain Event Listener Service
 * 
 * Listens to contract events and syncs them to the Postgres database.
 * This keeps the DB as a "materialized view" of blockchain state.
 */

import { getContract, getProvider } from "../lib/blockchain.js";
import prisma from "../lib/prisma.js";
import { ethers } from "ethers";

let isListening = false;

/**
 * Start listening to contract events
 */
export async function startEventListener(): Promise<void> {
  if (isListening) {
    console.log("Event listener already running");
    return;
  }

  try {
    const contract = getContract();
    const provider = getProvider();

    console.log("📡 Starting blockchain event listener...");

    // Listen for EventCreated
    contract.on("EventCreated", async (eventId, name, price, discountedPrice, maxSupply, startTime, endTime, event) => {
      console.log(`🎫 EventCreated: ${name} (ID: ${eventId})`);

      try {
        // Check if event already exists
        const existing = await prisma.event.findUnique({
          where: { onChainEventId: Number(eventId) },
        });

        if (!existing) {
          await prisma.event.create({
            data: {
              onChainEventId: Number(eventId),
              name,
              price: price.toString(),
              discountedPrice: discountedPrice.toString(),
              maxSupply: Number(maxSupply),
              startTime: new Date(Number(startTime) * 1000),
              endTime: new Date(Number(endTime) * 1000),
            },
          });
          console.log(`  ✅ Event synced to database`);
        }
      } catch (error) {
        console.error("  ❌ Failed to sync EventCreated:", error);
      }
    });

    // Listen for TicketPurchased
    contract.on("TicketPurchased", async (eventId, buyer, pricePaid, ticketSerial, quantity, event) => {
      console.log(`🎟️  TicketPurchased: Event ${eventId}, Serial ${ticketSerial}`);

      try {
        const dbEvent = await prisma.event.findUnique({
          where: { onChainEventId: Number(eventId) },
        });

        if (dbEvent) {
          // Check if ticket already exists
          const existing = await prisma.ticket.findUnique({
            where: {
              eventId_ticketSerial: {
                eventId: dbEvent.id,
                ticketSerial: Number(ticketSerial),
              },
            },
          });

          if (!existing) {
            // Find user by wallet
            const wallet = await prisma.wallet.findUnique({
              where: { address: buyer.toLowerCase() },
            });

            await prisma.ticket.create({
              data: {
                eventId: dbEvent.id,
                ownerUserId: wallet?.userId,
                ownerAddress: buyer.toLowerCase(),
                ticketSerial: Number(ticketSerial),
                status: "VALID",
              },
            });

            // Update sold count
            await prisma.event.update({
              where: { id: dbEvent.id },
              data: { totalSold: { increment: 1 } },
            });

            console.log(`  ✅ Ticket synced to database`);
          }
        }
      } catch (error) {
        console.error("  ❌ Failed to sync TicketPurchased:", error);
      }
    });

    // Listen for TicketTransferred
    contract.on("TicketTransferred", async (eventId, from, to, quantity, event) => {
      console.log(`🔄 TicketTransferred: Event ${eventId}, ${from} -> ${to}`);

      try {
        const dbEvent = await prisma.event.findUnique({
          where: { onChainEventId: Number(eventId) },
        });

        if (dbEvent) {
          // Find tickets from sender and update owner
          const tickets = await prisma.ticket.findMany({
            where: {
              eventId: dbEvent.id,
              ownerAddress: from.toLowerCase(),
              status: "VALID",
            },
            take: Number(quantity),
          });

          // Find new owner user
          const wallet = await prisma.wallet.findUnique({
            where: { address: to.toLowerCase() },
          });

          for (const ticket of tickets) {
            await prisma.ticket.update({
              where: { id: ticket.id },
              data: {
                ownerUserId: wallet?.userId,
                ownerAddress: to.toLowerCase(),
              },
            });
          }

          console.log(`  ✅ Transfer synced to database`);
        }
      } catch (error) {
        console.error("  ❌ Failed to sync TicketTransferred:", error);
      }
    });

    // Listen for TicketRefunded
    contract.on("TicketRefunded", async (eventId, holder, refundAmount, quantity, event) => {
      console.log(`💸 TicketRefunded: Event ${eventId}, Holder ${holder}`);

      try {
        const dbEvent = await prisma.event.findUnique({
          where: { onChainEventId: Number(eventId) },
        });

        if (dbEvent) {
          // Find and mark tickets as refunded
          const tickets = await prisma.ticket.findMany({
            where: {
              eventId: dbEvent.id,
              ownerAddress: holder.toLowerCase(),
              status: "VALID",
            },
            take: Number(quantity),
          });

          for (const ticket of tickets) {
            await prisma.ticket.update({
              where: { id: ticket.id },
              data: { status: "REFUNDED" },
            });
          }

          // Update sold count
          await prisma.event.update({
            where: { id: dbEvent.id },
            data: { totalSold: { decrement: Number(quantity) } },
          });

          console.log(`  ✅ Refund synced to database`);
        }
      } catch (error) {
        console.error("  ❌ Failed to sync TicketRefunded:", error);
      }
    });

    // Listen for TicketMarkedUsed
    contract.on("TicketMarkedUsed", async (eventId, ticketSerial, holder, event) => {
      console.log(`✓ TicketMarkedUsed: Event ${eventId}, Serial ${ticketSerial}`);

      try {
        const dbEvent = await prisma.event.findUnique({
          where: { onChainEventId: Number(eventId) },
        });

        if (dbEvent) {
          await prisma.ticket.updateMany({
            where: {
              eventId: dbEvent.id,
              ticketSerial: Number(ticketSerial),
              status: "VALID",
            },
            data: {
              status: "USED",
              usedAt: new Date(),
            },
          });

          console.log(`  ✅ Ticket use synced to database`);
        }
      } catch (error) {
        console.error("  ❌ Failed to sync TicketMarkedUsed:", error);
      }
    });

    // Handle disconnection and reconnection
    provider.on("error", (error) => {
      console.error("❌ Provider error:", error);
    });

    isListening = true;
    console.log("✅ Blockchain event listener started");
  } catch (error) {
    console.error("❌ Failed to start event listener:", error);
    throw error;
  }
}

/**
 * Stop listening to contract events
 */
export async function stopEventListener(): Promise<void> {
  if (!isListening) return;

  try {
    const contract = getContract();
    await contract.removeAllListeners();
    isListening = false;
    console.log("⏹️  Blockchain event listener stopped");
  } catch (error) {
    console.error("Error stopping event listener:", error);
  }
}

/**
 * Sync historical events from the blockchain
 * Useful for catching up after downtime
 */
export async function syncHistoricalEvents(fromBlock: number = 0): Promise<void> {
  console.log(`🔄 Syncing historical events from block ${fromBlock}...`);

  try {
    const contract = getContract();

    // Get EventCreated events
    const eventCreatedFilter = contract.filters.EventCreated();
    const eventCreatedLogs = await contract.queryFilter(eventCreatedFilter, fromBlock);

    for (const log of eventCreatedLogs) {
      if ("args" in log) {
        const [eventId, name, price, discountedPrice, maxSupply, startTime, endTime] = log.args;

        const existing = await prisma.event.findUnique({
          where: { onChainEventId: Number(eventId) },
        });

        if (!existing) {
          await prisma.event.create({
            data: {
              onChainEventId: Number(eventId),
              name,
              price: price.toString(),
              discountedPrice: discountedPrice.toString(),
              maxSupply: Number(maxSupply),
              startTime: new Date(Number(startTime) * 1000),
              endTime: new Date(Number(endTime) * 1000),
            },
          });
        }
      }
    }

    console.log(`✅ Synced ${eventCreatedLogs.length} EventCreated events`);

    // TODO: Sync TicketPurchased, TicketTransferred, etc.
    // This would follow the same pattern

  } catch (error) {
    console.error("❌ Failed to sync historical events:", error);
  }
}

