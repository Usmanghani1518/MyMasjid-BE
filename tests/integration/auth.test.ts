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
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    expect(res.body.data.tokens.refreshToken).toBeTruthy();
    expect(res.body.data.user.email).toBe(EMAIL);
  });

  it('rejects invalid credentials with INVALID_CREDENTIALS', async () => {
    await createUser(EMAIL, { password: PASSWORD });
    const res = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: 'WrongPass1!' });
    expect(res.status).toBe(401);
    expect(res.body.errors[0].code).toBe('INVALID_CREDENTIALS');
  });

  it('stores the submitted Masjid password and allows login after approval', async () => {
    const email = 'masjid-admin@example.com';
    const registration = await request(app).post('/api/v1/auth/register/masjid').send({
      legalName: 'Central Test Masjid', registrationNumber: 'REG-1001', email,
      contactNumber: '+44 20 7123 4567', password: PASSWORD, bio: 'Serving the local Muslim community.',
      streetAddress: '1 Test Street', city: 'London', postalCode: 'E1 1AA', logoUrl: null,
      selectedServices: ['zakat'],
      trustee: { fullName: 'Ahmed Khan', position: 'Chairman of the Board', idNumber: 'ID-12345' },
      files: [{ id: 'doc-1', name: 'registration.pdf', status: 'uploaded' }],
    });
    expect(registration.status).toBe(201);

    await prisma.user.update({ where: { email }, data: { isActive: true } });
    const signIn = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    expect(signIn.status).toBe(200);
    expect(signIn.body.data.user.role).toBe('masjid');
  });

  it('rotates the refresh token on /auth/refresh and revokes the old one', async () => {
    await createUser(EMAIL, { password: PASSWORD });
    const { refreshToken: original, accessToken } = await login(EMAIL, PASSWORD);

    const rotated = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: original });
    expect(rotated.status).toBe(200);
    const newRefresh = rotated.body.data.tokens.refreshToken;
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
