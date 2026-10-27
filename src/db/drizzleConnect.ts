import { drizzle } from 'drizzle-orm/node-postgres'

export const db = drizzle({
  connection: {
    connectionString: process.env.DATABASE_URL!,
    // Idle connections do not keep Node running once the server has closed.
    allowExitOnIdle: true,
  },
})
