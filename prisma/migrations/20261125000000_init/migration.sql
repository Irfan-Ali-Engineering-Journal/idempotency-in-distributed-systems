-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProviderTransactionStatus" AS ENUM ('SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "customer_reference" VARCHAR(255) NOT NULL,
    "provider_transaction_id" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'PROCESSING',
    "response_status_code" INTEGER,
    "response_body" JSONB,
    "payment_id" UUID,
    "lease_expires_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_transactions" (
    "id" UUID NOT NULL,
    "provider_idempotency_key" VARCHAR(255) NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "status" "ProviderTransactionStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_customer_reference_idx" ON "payments"("customer_reference");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_created_at_idx" ON "payments"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_key_key" ON "idempotency_records"("key");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE INDEX "idempotency_records_status_idx" ON "idempotency_records"("status");

-- CreateIndex
CREATE INDEX "idempotency_records_payment_id_idx" ON "idempotency_records"("payment_id");

-- CreateIndex
CREATE INDEX "idempotency_records_status_lease_expires_at_idx" ON "idempotency_records"("status", "lease_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "provider_transactions_provider_idempotency_key_key" ON "provider_transactions"("provider_idempotency_key");

-- CreateIndex
CREATE INDEX "provider_transactions_payment_id_idx" ON "provider_transactions"("payment_id");
