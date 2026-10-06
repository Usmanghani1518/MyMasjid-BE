declare global {
  namespace Express {
    interface Request {
      requestId: string;
      requestStartedAt: number;
    }
  }
}

export {};
