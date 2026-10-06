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
    expect(res.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
    expect(new Date(res.body.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('uses a valid caller request ID for log correlation', async () => {
    const res = await request(app).get('/api/v1/health').set('x-request-id', 'frontend-123');

    expect(res.headers['x-request-id']).toBe('frontend-123');
  });

  it('returns the request ID with API errors', async () => {
    const res = await request(app).get('/does-not-exist').set('x-request-id', 'debug-404');

    expect(res.status).toBe(404);
    expect(res.body.error.requestId).toBe('debug-404');
  });
});
