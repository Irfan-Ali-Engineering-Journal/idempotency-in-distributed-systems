import { Injectable } from '@nestjs/common';
import { Payment, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createProcessing(data: {
    amount: number;
    currency: string;
    customerReference: string;
  }): Promise<Payment> {
    return this.prisma.payment.create({
      data: {
        amount: new Prisma.Decimal(data.amount.toFixed(2)),
        currency: data.currency.trim().toUpperCase(),
        customerReference: data.customerReference.trim(),
        status: PaymentStatus.PROCESSING,
      },
    });
  }

  async findById(id: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({ where: { id } });
  }

  async findAll(params: {
    limit: number;
    offset: number;
    status?: PaymentStatus;
    customerReference?: string;
  }): Promise<{ items: Payment[]; total: number }> {
    const where: Prisma.PaymentWhereInput = {};
    if (params.status) {
      where.status = params.status;
    }
    if (params.customerReference) {
      where.customerReference = params.customerReference;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params.limit,
        skip: params.offset,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { items, total };
  }

  async updateResult(
    id: string,
    data: {
      status: PaymentStatus;
      providerTransactionId: string;
    },
  ): Promise<Payment> {
    return this.prisma.payment.update({
      where: { id },
      data: {
        status: data.status,
        providerTransactionId: data.providerTransactionId,
      },
    });
  }
}
