import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    userEmail?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      session: any;
    }
  }
}

export {};
