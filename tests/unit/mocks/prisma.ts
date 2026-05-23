import { jest } from "@jest/globals";

type MockFn = ReturnType<typeof jest.fn>;

type PrismaMock = {
  documentGenerationLog: {
    findMany: MockFn;
    findFirst: MockFn;
    delete: MockFn;
  };
  letterInstance: {
    findMany: MockFn;
    findFirst: MockFn;
  };
  letterCounter: {
    findMany: MockFn;
  };
  letterVerification: {
    findUnique: MockFn;
    create: MockFn;
  };
};

export const Prisma: PrismaMock = {
  documentGenerationLog: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
  letterInstance: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  letterCounter: {
    findMany: jest.fn(),
  },
  letterVerification: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};
