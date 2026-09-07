import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '@/app';

describe('health route', () => {
  it('returns API health status', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      message: 'MyMasjid API is running',
    });
    expect(new Date(res.body.timestamp).toString()).not.toBe('Invalid Date');
  });
});
