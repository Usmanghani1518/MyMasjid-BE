import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, prisma, describeIfDb, truncateAll, createUser, login } from '../helpers';

const EMAIL = 'auth-user@example.com';
const PASSWORD = 'Passw0rd123!';

describeIfDb('Authentication', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('logs in and returns an access + refresh token pair', async () => {
    await createUser(EMAIL, { password: PASSWORD });
    const res = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.user.email).toBe(EMAIL);
  });

  it('rejects invalid credentials with INVALID_CREDENTIALS', async () => {
    await createUser(EMAIL, { password: PASSWORD });
    const res = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: 'WrongPass1!' });
    expect(res.status).toBe(401);
    expect(res.body.errors[0].code).toBe('INVALID_CREDENTIALS');
  });

  it('rotates the refresh token on /auth/refresh and revokes the old one', async () => {
    await createUser(EMAIL, { password: PASSWORD });
    const { refreshToken: original, accessToken } = await login(EMAIL, PASSWORD);

    const rotated = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: original });
    expect(rotated.status).toBe(200);
    const newRefresh = rotated.body.data.refreshToken;
    expect(newRefresh).not.toBe(original);

    // The old token is now revoked → reuse is rejected.
    const reuse = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: original });
    expect(reuse.status).toBe(401);
    expect(reuse.body.errors[0].code).toBe('REFRESH_TOKEN_REVOKED');

    // The new token still works.
    const next = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: newRefresh });
    expect(next.status).toBe(200);

    const stored = await prisma.refreshToken.count({ where: { revokedAt: { not: null } } });
    expect(stored).toBeGreaterThanOrEqual(2);
  });

  it('revokes the refresh token on logout', async () => {
    await createUser(EMAIL, { password: PASSWORD });
    const { refreshToken } = await login(EMAIL, PASSWORD);

    const logout = await request(app).post('/api/v1/auth/logout').send({ refreshToken });
    expect(logout.status).toBe(200);

    const refresh = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(refresh.status).toBe(401);
  });

  it('returns the current user via /auth/me with a valid access token', async () => {
    await createUser(EMAIL, { password: PASSWORD });
    const { accessToken } = await login(EMAIL, PASSWORD);
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(EMAIL);
  });

  it('rejects an invalid access token on /auth/me', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-token');
    expect(res.status).toBe(401);
  });
});
