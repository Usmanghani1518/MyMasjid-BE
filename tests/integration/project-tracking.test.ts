import { beforeEach, expect, it } from 'vitest';
import request from 'supertest';
import { Role } from '@/generated/prisma/enums';
import { app, createUser, describeIfDb, login, prisma, truncateAll } from '../helpers';

describeIfDb('Project tracking APIs', () => {
  beforeEach(async () => truncateAll());

  it('combines milestone, construction, budget, and dashboard resources against one owned project', async () => {
    const password = 'Passw0rd123!';
    const user = await createUser('tracking@example.com', { role: Role.MASJID_ADMIN, password });
    await prisma.masjid.create({ data: { name: 'Tracking Masjid', ownerId: user.id } });
    const { accessToken } = await login(user.email, password);
    const auth = { Authorization: `Bearer ${accessToken}` };

    const projectResponse = await request(app).post('/api/v1/masjid/projects').set(auth).send({
      name: 'North Wing Expansion', category: 'Construction', managerName: 'Ahmed Khan', location: 'London',
      description: 'Expand the north wing.', currency: 'GBP', estimatedTotalCost: 500000, fundraisingGoal: 400000,
    });
    expect(projectResponse.status).toBe(201);
    const projectId = projectResponse.body.data.project.id as string;

    const milestoneResponse = await request(app).patch(`/api/v1/masjid/projects/${projectId}/milestones`).set(auth).send({
      resource: 'MILESTONE', action: 'CREATE', data: {
        name: 'Roof Installation', phaseLabel: 'Phase 03', status: 'IN_PROGRESS', progressPercent: 65,
        plannedStartDate: '2026-10-01', dueDate: '2026-11-15', primaryContractor: 'ABC Contractors Ltd.', position: 1,
      },
    });
    expect(milestoneResponse.status).toBe(200);
    const milestoneId = milestoneResponse.body.data.result.id as string;

    const progress = await request(app).patch(`/api/v1/masjid/projects/${projectId}/milestones`).set(auth).send({ resource: 'UPDATE', action: 'CREATE', milestoneId, data: { message: 'Roof structure inspected.', progressPercent: 72 } });
    expect(progress.status).toBe(200);
    const comment = await request(app).patch(`/api/v1/masjid/projects/${projectId}/milestones`).set(auth).send({ resource: 'COMMENT', action: 'CREATE', milestoneId, data: { body: 'Inspection evidence received.' } });
    expect(comment.status).toBe(200);

    const log = await request(app).patch(`/api/v1/masjid/projects/${projectId}/construction`).set(auth).send({
      resource: 'LOG', action: 'CREATE', data: { milestoneId, type: 'DAILY', logDate: '2026-10-15', title: 'Roof beams installed', body: 'All major trusses secured.', progressPercent: 72,
        assets: [{ kind: 'IMAGE', url: 'https://cdn.example.com/roof.jpg', label: 'Roof structure' }] },
    });
    expect(log.status).toBe(200);
    expect(log.body.data.result.assets).toHaveLength(1);

    const gallery = await request(app).patch(`/api/v1/masjid/projects/${projectId}/construction`).set(auth).send({
      resource: 'ASSET', action: 'CREATE', data: { milestoneId, kind: 'IMAGE', url: 'https://cdn.example.com/gallery.jpg', label: 'Dome aerial', position: 1 },
    });
    expect(gallery.status).toBe(200);
    const report = await request(app).patch(`/api/v1/masjid/projects/${projectId}/construction`).set(auth).send({
      resource: 'REPORT', action: 'CREATE', data: { title: 'Structural Safety Audit', reportType: 'SAFETY', fileUrl: 'https://cdn.example.com/audit.pdf', verified: true },
    });
    expect(report.status).toBe(200);

    const allocationResponse = await request(app).patch(`/api/v1/masjid/projects/${projectId}/budget`).set(auth).send({
      resource: 'ALLOCATION', action: 'CREATE', data: { name: 'Structural Construction', totalBudget: 300000, warningThreshold: 80 },
    });
    expect(allocationResponse.status).toBe(200);
    const allocationId = allocationResponse.body.data.result.id as string;

    const expenditure = await request(app).patch(`/api/v1/masjid/projects/${projectId}/budget`).set(auth).send({
      resource: 'EXPENDITURE', action: 'CREATE', data: { allocationId, vendor: 'Amana Construction', description: 'Steel materials', amount: 50000,
        expenditureDate: '2026-10-20', status: 'APPROVED', receiptUrl: 'https://cdn.example.com/receipt.pdf' },
    });
    expect(expenditure.status).toBe(200);
    const invoice = await request(app).patch(`/api/v1/masjid/projects/${projectId}/budget`).set(auth).send({
      resource: 'INVOICE', action: 'CREATE', data: { allocationId, vendor: 'Amana Construction', invoiceNumber: 'INV-2026-001', amount: 25000, dueDate: '2027-01-15' },
    });
    expect(invoice.status).toBe(200);
    const forecast = await request(app).patch(`/api/v1/masjid/projects/${projectId}/budget`).set(auth).send({ resource: 'FORECAST', action: 'CREATE', data: { month: '2026-10', forecastAmount: 60000 } });
    expect(forecast.status).toBe(200);

    const budget = await request(app).get(`/api/v1/masjid/projects/${projectId}/budget`).set(auth);
    expect(budget.status).toBe(200);
    expect(budget.body.data.summary).toMatchObject({ totalBudget: 500000, totalSpent: 50000, remaining: 450000 });
    expect(budget.body.data.allocations[0]).toMatchObject({ spent: 50000, remaining: 250000 });
    expect(budget.body.data.expenditures).toHaveLength(1);
    expect(budget.body.data.invoices).toHaveLength(1);
    expect(budget.body.data.forecast).toHaveLength(1);

    const construction = await request(app).get(`/api/v1/masjid/projects/${projectId}/construction`).set(auth);
    expect(construction.status).toBe(200);
    expect(construction.body.data).toMatchObject({ phases: [{ id: milestoneId }], logs: [{ id: log.body.data.result.id }] });
    expect(construction.body.data.phases[0].comments).toHaveLength(1);
    expect(construction.body.data.phases[0].updates).toHaveLength(1);

    const milestones = await request(app).get(`/api/v1/masjid/projects/${projectId}/milestones`).set(auth);
    expect(milestones.status).toBe(200);
    expect(milestones.body.data.summary).toMatchObject({ total: 1, inProgress: 1 });
    expect(milestones.body.data.items[0].comments).toHaveLength(1);
    expect(milestones.body.data.items[0].updates).toHaveLength(1);
    const allDashboard = await request(app).get('/api/v1/masjid/projects/dashboard').set(auth);
    expect(allDashboard.status).toBe(200);
    expect(allDashboard.body.data.summary.totalProjects).toBe(1);
  });
});
