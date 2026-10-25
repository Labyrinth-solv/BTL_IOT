import { PrismaClient } from '@prisma/client';

// Enable BigInt serialization for JSON responses
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export default prisma;

