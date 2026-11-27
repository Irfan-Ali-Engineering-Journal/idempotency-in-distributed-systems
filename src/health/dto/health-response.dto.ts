import { ApiProperty } from '@nestjs/swagger';

export class DependencyStatusDto {
  @ApiProperty({ enum: ['up', 'down'], example: 'up' })
  postgres: 'up' | 'down';

  @ApiProperty({ enum: ['up', 'down'], example: 'up' })
  redis: 'up' | 'down';
}

export class HealthResponseDto {
  @ApiProperty({
    enum: ['healthy', 'degraded', 'unhealthy'],
    example: 'healthy',
  })
  status: string;

  @ApiProperty({ example: 120 })
  uptimeSeconds: number;

  @ApiProperty({ example: '2026-11-25T04:30:00.000Z' })
  timestamp: string;

  @ApiProperty({ type: DependencyStatusDto })
  dependencies: DependencyStatusDto;
}

export class ReadinessResponseDto {
  @ApiProperty({ enum: ['ready', 'degraded', 'not_ready'], example: 'ready' })
  status: string;

  @ApiProperty({ example: '2026-11-25T04:30:00.000Z' })
  timestamp: string;

  @ApiProperty({ type: DependencyStatusDto })
  dependencies: DependencyStatusDto;
}

export class LivenessResponseDto {
  @ApiProperty({ example: 'alive' })
  status: string;

  @ApiProperty({ example: '2026-11-25T04:30:00.000Z' })
  timestamp: string;
}
