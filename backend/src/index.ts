import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { config, validateConfig } from "./config/index.js";
import { initBlockchain } from "./lib/blockchain.js";
import { authenticate } from "./lib/auth.js";
import { authRoutes } from "./routes/auth.js";
import { eventsRoutes } from "./routes/events.js";
import { ticketsRoutes } from "./routes/tickets.js";
import { startEventListener } from "./services/eventListener.js";

// Extend Fastify type to include our custom decorators
declare module "fastify" {
  interface FastifyInstance {
    authenticate: typeof authenticate;
  }
}

async function main() {
  // Validate configuration
  try {
    validateConfig();
  } catch (error) {
    console.error("Configuration error:", error);
    process.exit(1);
  }

  // Create Fastify instance
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
      transport:
        process.env.NODE_ENV !== "production"
          ? {
              target: "pino-pretty",
              options: {
                colorize: true,
              },
            }
          : undefined,
    },
  });

  // Register plugins
  await fastify.register(cors, {
    origin: true, // Allow all origins in development
    credentials: true,
  });

  await fastify.register(jwt, {
    secret: config.jwtSecret,
    sign: {
      expiresIn: config.jwtExpiresIn,
    },
  });

  // Decorate fastify with authenticate function
  fastify.decorate("authenticate", authenticate);

  // Register routes
  await fastify.register(authRoutes, { prefix: "/auth" });
  await fastify.register(eventsRoutes, { prefix: "/events" });
  await fastify.register(ticketsRoutes, { prefix: "/tickets" });

  // Health check endpoint
  fastify.get("/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  });

  // API info endpoint
  fastify.get("/", async () => {
    return {
      name: "BU TicketChain API",
      version: "1.0.0",
      endpoints: {
        auth: "/auth",
        events: "/events",
        tickets: "/tickets",
        health: "/health",
      },
    };
  });

  // Initialize blockchain connection
  try {
    initBlockchain();
  } catch (error) {
    console.warn("⚠️  Blockchain initialization failed:", error);
    console.warn("   Continuing without blockchain features...");
  }

  // Start blockchain event listener
  try {
    await startEventListener();
  } catch (error) {
    console.warn("⚠️  Event listener failed to start:", error);
    console.warn("   Database may become out of sync with blockchain.");
  }

  // Start server
  try {
    await fastify.listen({
      port: config.port,
      host: config.host,
    });

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🎫 BU TicketChain Backend                               ║
║                                                           ║
║   Server running at http://${config.host}:${config.port}              ║
║                                                           ║
║   Endpoints:                                              ║
║   • POST /auth/register  - Register new user              ║
║   • POST /auth/login     - Login                          ║
║   • GET  /events         - List events                    ║
║   • POST /events         - Create event (admin)           ║
║   • GET  /tickets/me     - My tickets                     ║
║   • POST /tickets/buy    - Record purchase                ║
║   • POST /tickets/verify - Verify ticket (verifier)       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down gracefully...");
    await fastify.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();

