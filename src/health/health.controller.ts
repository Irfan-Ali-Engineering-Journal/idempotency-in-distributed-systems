import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  HealthResponseDto,
  LivenessResponseDto,
  ReadinessResponseDto,
} from './dto/health-response.dto';

@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Overall application health status' })
  @ApiResponse({
    status: 200,
    description: 'Application health summary',
    type: HealthResponseDto,
  })
  @ApiResponse({
    status: 503,
    description: 'Critical dependency unavailable',
    type: HealthResponseDto,
  })
  async getHealth(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthResponseDto> {
    const [postgresHealthy, redisHealthy] = await Promise.all([
      this.prisma.isHealthy(),
      this.redis.isHealthy(),
    ]);

    const status = !postgresHealthy
      ? 'unhealthy'
      : redisHealthy
        ? 'healthy'
        : 'degraded';

    if (!postgresHealthy) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      status,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      dependencies: {
        postgres: postgresHealthy ? 'up' : 'down',
        redis: redisHealthy ? 'up' : 'down',
      },
    };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Returns 200 when PostgreSQL is reachable (even if Redis is down, as Redis is an optimization). Returns 503 if PostgreSQL is down.',
  })
  @ApiResponse({
    status: 200,
    description: 'Application is ready to serve traffic',
    type: ReadinessResponseDto,
  })
  @ApiResponse({
    status: 503,
    description: 'Application is not ready (PostgreSQL unreachable)',
    type: ReadinessResponseDto,
  })
  async getReadiness(
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReadinessResponseDto> {
    const [postgresHealthy, redisHealthy] = await Promise.all([
      this.prisma.isHealthy(),
      this.redis.isHealthy(),
    ]);

    if (!postgresHealthy) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        dependencies: {
          postgres: 'down',
          redis: redisHealthy ? 'up' : 'down',
        },
      };
    }

    return {
      status: redisHealthy ? 'ready' : 'degraded',
      timestamp: new Date().toISOString(),
      dependencies: {
        postgres: 'up',
        redis: redisHealthy ? 'up' : 'down',
      },
    };
  }

  @Get('live')
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Returns 200 as long as the Node.js process is alive. Does not fail on external dependency outages.',
  })
  @ApiResponse({
    status: 200,
    description: 'Process is alive',
    type: LivenessResponseDto,
  })
  getLiveness(): LivenessResponseDto {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
    };
  }
}
