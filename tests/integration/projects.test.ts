import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Role } from '@/generated/prisma/enums';
import { app, createUser, describeIfDb, login, prisma, truncateAll } from '../helpers';

const PASSWORD = 'Passw0rd123!';

const createMasjidAdmin = async (email: string, masjidName: string) => {
  const user = await createUser(email, { role: Role.MASJID_ADMIN, password: PASSWORD });
  await prisma.masjid.create({ data: { name: masjidName, ownerId: user.id } });
  const { accessToken } = await login(email, PASSWORD);
  return { user, accessToken };
};

const projectPayload = {
  name: 'Community Centre Expansion',
  category: 'Construction',
  managerName: 'Ahmed Khan',
  location: '1 Community Road, London',
  description: 'Expand the community centre and main prayer facilities.',
  currency: 'gbp',
  estimatedTotalCost: 250000,
  fundraisingGoal: 180000,
  seedFunding: 45000,
  constructionProgress: 0,
  startDate: '2026-10-01',
  completionDate: '2027-04-01',
  fundingSources: [
    { id: 'zakat', label: 'Zakat Eligible', percentage: 40 },
    { id: 'sadaqah', label: 'Sadaqah Jariyah', percentage: 35 },
    { id: 'waqf', label: 'Waqf Endowment', percentage: 25 },
  ],
  milestones: [{ id: 'm-1', name: 'Planning and permits', durationWeeks: 4 }],
};

describeIfDb('Masjid project CRUD', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('creates, retrieves, updates, lists, summarizes, and soft-deletes a project', async () => {
    const { accessToken } = await createMasjidAdmin('projects@example.com', 'Projects Masjid');
    const auth = { Authorization: `Bearer ${accessToken}` };

    const created = await request(app).post('/api/v1/masjid/projects').set(auth).send(projectPayload);
    expect(created.status).toBe(201);
    expect(created.body.data.project).toMatchObject({
      name: projectPayload.name,
      status: 'PLANNED',
      currency: 'GBP',
      estimatedTotalCost: 250000,
      fundraisingGoal: 180000,
    });
    const id = created.body.data.project.id as string;

    const retrieved = await request(app).get(`/api/v1/masjid/projects/${id}`).set(auth);
    expect(retrieved.status).toBe(200);
    expect(retrieved.body.data.project.id).toBe(id);

    const updated = await request(app).patch(`/api/v1/masjid/projects/${id}`).set(auth).send({
      status: 'ACTIVE', constructionProgress: 25, notice: 'Site preparation started',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.project).toMatchObject({ status: 'ACTIVE', constructionProgress: 25 });

    const list = await request(app).get('/api/v1/masjid/projects?status=ACTIVE&search=centre&page=1&pageSize=5').set(auth);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.pagination).toEqual({ page: 1, pageSize: 5, total: 1, totalPages: 1 });

    const summary = await request(app).get('/api/v1/masjid/projects/summary').set(auth);
    expect(summary.status).toBe(200);
    expect(summary.body.data).toEqual({ totalProjects: 1, activeProjects: 1, completedProjects: 0, plannedProjects: 0 });

    const deleted = await request(app).delete(`/api/v1/masjid/projects/${id}`).set(auth);
    expect(deleted.status).toBe(200);
    expect(deleted.body.data).toEqual({ project: { id, deleted: true } });

    const afterDelete = await request(app).get(`/api/v1/masjid/projects/${id}`).set(auth);
    expect(afterDelete.status).toBe(404);
    const summaryAfterDelete = await request(app).get('/api/v1/masjid/projects/summary').set(auth);
    expect(summaryAfterDelete.body.data.totalProjects).toBe(0);
  });

  it('never exposes another Masjid project', async () => {
    const first = await createMasjidAdmin('owner-one@example.com', 'First Masjid');
    const second = await createMasjidAdmin('owner-two@example.com', 'Second Masjid');
    const created = await request(app)
      .post('/api/v1/masjid/projects')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send(projectPayload);

    const hidden = await request(app)
      .get(`/api/v1/masjid/projects/${created.body.data.project.id}`)
      .set('Authorization', `Bearer ${second.accessToken}`);
    expect(hidden.status).toBe(404);
    expect(hidden.body.errors[0].code).toBe('PROJECT_NOT_FOUND');
  });

  it('rejects invalid project totals, dates, funding percentages, and empty updates', async () => {
    const { accessToken } = await createMasjidAdmin('project-validation@example.com', 'Validation Masjid');
    const auth = { Authorization: `Bearer ${accessToken}` };
    const invalid = await request(app).post('/api/v1/masjid/projects').set(auth).send({
      ...projectPayload,
      fundraisingGoal: 300000,
      completionDate: '2026-09-01',
      fundingSources: [{ id: 'waqf', label: 'Waqf', percentage: 50 }],
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.errors.map((error: { field: string }) => error.field)).toEqual(
      expect.arrayContaining(['fundraisingGoal', 'completionDate', 'fundingSources']),
    );

    const created = await request(app).post('/api/v1/masjid/projects').set(auth).send(projectPayload);
    const emptyUpdate = await request(app)
      .patch(`/api/v1/masjid/projects/${created.body.data.project.id}`)
      .set(auth)
      .send({});
    expect(emptyUpdate.status).toBe(400);
  });
});
