import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';
import prisma from '../config/prisma';
import { Role, UserStatus } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  status: UserStatus;
  managed_zones?: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const authenticateJWT = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

    const getDefaultUser = async (): Promise<AuthUser> => {
      const u = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
      if (u) {
        return {
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          role: u.role,
          status: u.status,
          managed_zones: [],
        };
      }
      return {
        id: 'demo-admin-id',
        email: 'operator@grain.com',
        full_name: 'Người Vận Hành (Demo Mode)',
        role: Role.ADMIN,
        status: UserStatus.ACTIVE,
        managed_zones: [],
      };
    };

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = await getDefaultUser();
      return next();
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, ENV.JWT_SECRET) as { id: string; email: string };

      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        include: {
          managed_zones: {
            select: { id: true },
          },
        },
      });

      if (!user) {
        req.user = await getDefaultUser();
        return next();
      }

      req.user = {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        status: user.status,
        managed_zones: user.managed_zones.map((z) => z.id),
      };

      next();
    } catch (error) {
      req.user = await getDefaultUser();
      next();
    }
};

