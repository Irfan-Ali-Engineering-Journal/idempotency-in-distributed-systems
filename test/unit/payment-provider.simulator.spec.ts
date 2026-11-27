import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ProviderTransactionStatus } from '@prisma/client';
import { PrismaService } from '../../src/database/prisma.service';
import { PaymentProviderSimulator } from '../../src/payment-provider/payment-provider.simulator';

describe('PaymentProviderSimulator', () => {
  let simulator: PaymentProviderSimulator;
  let prisma: {
    providerTransaction: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      providerTransaction: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
      },
    };
    const configService = {
      get: jest.fn().mockReturnValue(0),
    } as unknown as ConfigService;

    simulator = new PaymentProviderSimulator(
      prisma as unknown as PrismaService,
      configService,
    );
  });

  it('deduplicates when providerTransaction already exists', async () => {
    prisma.providerTransaction.findUnique.mockResolvedValue({
      id: 'tx-existing',
      status: ProviderTransactionStatus.SUCCEEDED,
      amount: new Prisma.Decimal('5000.00'),
      currency: 'PKR',
    });

    const result = await simulator.charge({
      providerIdempotencyKey: 'key-1',
      paymentId: 'pay-1',
      amount: 5000,
      currency: 'PKR',
    });

    expect(result.deduplicated).toBe(true);
    expect(result.providerTransactionId).toBe('tx-existing');
    expect(prisma.providerTransaction.create).not.toHaveBeenCalled();
  });

  it('creates FAILED provider transaction when simulateBehavior is fail', async () => {
    prisma.providerTransaction.findUnique.mockResolvedValue(null);
    prisma.providerTransaction.create.mockResolvedValue({
      id: 'tx-fail',
      status: ProviderTransactionStatus.FAILED,
      amount: new Prisma.Decimal('1500.00'),
      currency: 'PKR',
    });

    const result = await simulator.charge({
      providerIdempotencyKey: 'key-fail',
      paymentId: 'pay-2',
      amount: 1500,
      currency: 'PKR',
      simulateBehavior: 'fail',
    });

    expect(result.status).toBe(ProviderTransactionStatus.FAILED);
    expect(result.deduplicated).toBe(false);
  });

  it('throws 504 Gateway Timeout after persisting transaction when simulateBehavior is timeout', async () => {
    prisma.providerTransaction.findUnique.mockResolvedValue(null);
    prisma.providerTransaction.create.mockResolvedValue({
      id: 'tx-timeout',
      status: ProviderTransactionStatus.SUCCEEDED,
      amount: new Prisma.Decimal('7500.00'),
      currency: 'PKR',
    });

    await expect(
      simulator.charge({
        providerIdempotencyKey: 'key-timeout',
        paymentId: 'pay-3',
        amount: 7500,
        currency: 'PKR',
        simulateBehavior: 'timeout',
      }),
    ).rejects.toThrow(HttpException);

    expect(prisma.providerTransaction.create).toHaveBeenCalledTimes(1);
  });
});
