import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../src/redis/redis.service';

describe('RedisService', () => {
  it('returns null on getJson and does not throw on setJson when Redis is disconnected', async () => {
    const configService = {
      get: jest.fn((key: string, defaultVal: unknown) => {
        if (key === 'redis.port') return 6399; // non-existent port
        return defaultVal;
      }),
    } as unknown as ConfigService;

    const service = new RedisService(configService);
    const val = await service.getJson('missing-key');
    expect(val).toBeNull();

    await expect(
      service.setJson('some-key', { ok: true }),
    ).resolves.toBeUndefined();
    await expect(service.del('some-key')).resolves.toBeUndefined();

    await service.onModuleDestroy();
  });
});
