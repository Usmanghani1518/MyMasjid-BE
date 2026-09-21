






import bcrypt from 'bcrypt';
import { prisma } from '@/config/database';
import { Role, RegistrationStatus } from '@/generated/prisma/enums';

const BCRYPT_ROUNDS = 12;
const SEED_PASSWORD = 'Passw0rd123!';

const seedEmails = [
  'admin@mymasjid.org',
  'donor@example.com',
  'volunteer@example.com',
  'masjid-approved@example.com',
  'masjid-denied@example.com',
  'masjid-pending@example.com',
  'masjid-draft@example.com',
];

const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, BCRYPT_ROUNDS);

async function main(): Promise<void> {
  console.log('🌱 Seeding database...');

  
  await prisma.user.deleteMany({ where: { email: { in: seedEmails } } });

  const passwordHash = await hashPassword(SEED_PASSWORD);

  
  const admin = await prisma.user.create({
    data: {
      email: 'admin@mymasjid.org',
      password: passwordHash,
      name: 'MyMasjid Admin',
      role: Role.SUPER_ADMIN,
    },
  });

  
  const donorUser = await prisma.user.create({
    data: {
      email: 'donor@example.com',
      password: passwordHash,
      name: 'Ahmad Khan',
      role: Role.DONOR,
    },
  });
  await prisma.donor.create({
    data: {
      userId: donorUser.id,
      fullName: 'Ahmad Khan',
      phoneCountryCode: '+92',
      phoneNumber: '0300 1234567',
      address: '12 Model Town',
      city: 'Lahore',
      country: 'PK',
      dateOfBirth: new Date('1990-05-15'),
      idType: 'NATIONAL_ID',
      idNumberEnc: '3520212345678',
      interests: ['ZAKAT', 'SADAQAH', 'EDUCATION'],
      registrationStep: 4,
      status: RegistrationStatus.ACTIVE,
      emailVerified: true,
      completedAt: new Date(),
    },
  });

  
  const volunteerUser = await prisma.user.create({
    data: {
      email: 'volunteer@example.com',
      password: passwordHash,
      name: 'Fatima Noor',
      role: Role.VOLUNTEER,
    },
  });
  await prisma.volunteer.create({
    data: {
      userId: volunteerUser.id,
      fullName: 'Fatima Noor',
      phoneCountryCode: '+92',
      phoneNumber: '0301 7654321',
      address: 'House 5, Gulberg',
      city: 'Lahore',
      country: 'PK',
      bio: 'Community volunteer with a passion for education and food drives.',
      skills: ['TEACHING', 'EVENT_MANAGEMENT', 'SOCIAL_MEDIA'],
      interests: ['EDUCATION', 'FOOD_DISTRIBUTION'],
      availabilityDays: ['FRIDAY', 'SATURDAY'],
      availabilityTimes: ['MORNING', 'AFTERNOON'],
      registrationStep: 4,
      status: RegistrationStatus.ACTIVE,
      emailVerified: true,
      completedAt: new Date(),
    },
  });

  
  const approvedOwner = await prisma.user.create({
    data: {
      email: 'masjid-approved@example.com',
      password: passwordHash,
      name: 'Abdul Rahman',
      role: Role.MASJID_ADMIN,
    },
  });
  const approvedMasjid = await prisma.masjid.create({
    data: {
      name: 'Masjid Al-Noor',
      ownerId: approvedOwner.id,
      registrationStep: 5,
      status: RegistrationStatus.APPROVED,
      submittedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      reviewedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
      reviewedBy: admin.id,
      email: 'masjid-approved@example.com',
      phoneCountryCode: '+92',
      phoneNumber: '0300 1111111',
      address: '1 Al-Noor Street',
      city: 'Lahore',
      state: 'Punjab',
      country: 'PK',
      organizationType: 'MASJID',
      registrationNumber: 'ORG-2024-0001',
      establishedYear: 2005,
      description: 'Community masjid serving Model Town.',
      missionStatement: 'To serve the community through worship, education, and charity.',
      services: ['FIVE_DAILY_PRAYERS', 'JUMMAH', 'QURAN_CLASSES', 'ZAKAT_DISTRIBUTION'],
      handlesZakat: true,
      acceptsOnlineDonations: true,
    },
  });
  await prisma.trustee.createMany({
    data: [
      {
        masjidId: approvedMasjid.id,
        fullName: 'Abdul Rahman',
        email: 'masjid-approved@example.com',
        role: 'CHAIR',
        idType: 'NATIONAL_ID',
        idNumberEnc: '3520111111111',
      },
      {
        masjidId: approvedMasjid.id,
        fullName: 'Mohammad Imran',
        email: 'imran@alnoor.example',
        role: 'TREASURER',
      },
    ],
  });
  await prisma.uploadedDocument.create({
    data: {
      masjidId: approvedMasjid.id,
      uploaderId: approvedOwner.id,
      originalName: 'registration-certificate.pdf',
      storedName: 'seed-registration-cert.pdf',
      mimeType: 'application/pdf',
      size: 24576,
      purpose: 'REGISTRATION_CERT',
      filePath: 'uploads/seed-registration-cert.pdf',
    },
  });

  
  const deniedOwner = await prisma.user.create({
    data: {
      email: 'masjid-denied@example.com',
      password: passwordHash,
      name: 'Bilal Ahmed',
      role: Role.MASJID_ADMIN,
    },
  });
  await prisma.masjid.create({
    data: {
      name: 'Masjid Al-Falah',
      ownerId: deniedOwner.id,
      registrationStep: 5,
      status: RegistrationStatus.DENIED,
      submittedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      reviewedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      reviewedBy: admin.id,
      email: 'masjid-denied@example.com',
      address: '22 Ferozepur Road',
      city: 'Lahore',
      country: 'PK',
      organizationType: 'MASJID',
      description: 'Neighborhood masjid seeking registration.',
      missionStatement: 'Serving the local community.',
      services: ['FIVE_DAILY_PRAYERS', 'JUMMAH'],
      denialReasons: [
        { field: 'trustees', code: 'INCOMPLETE_TRUSTEES', message: 'Only one trustee provided; a minimum of two is required.' },
        { field: 'registrationNumber', code: 'INVALID_DOCUMENT', message: 'The uploaded registration certificate is illegible.' },
      ],
      reviewNote: 'Please add a second trustee and re-upload a clear registration certificate.',
    },
  });

  
  const pendingOwner = await prisma.user.create({
    data: {
      email: 'masjid-pending@example.com',
      password: passwordHash,
      name: 'Usman Tariq',
      role: Role.MASJID_ADMIN,
    },
  });
  const pendingMasjid = await prisma.masjid.create({
    data: {
      name: 'Masjid Al-Huda',
      ownerId: pendingOwner.id,
      registrationStep: 5,
      status: RegistrationStatus.PENDING_REVIEW,
      submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      email: 'masjid-pending@example.com',
      phoneCountryCode: '+92',
      phoneNumber: '0302 2222222',
      address: '7 Cavalry Ground',
      city: 'Lahore',
      state: 'Punjab',
      country: 'PK',
      organizationType: 'MADRASSA',
      registrationNumber: 'ORG-2025-0110',
      establishedYear: 2010,
      description: 'Masjid and madrassa offering Quran classes and community support.',
      missionStatement: 'Educate and uplift the community through Islamic learning.',
      services: ['FIVE_DAILY_PRAYERS', 'JUMMAH', 'QURAN_CLASSES', 'MADRASSA'],
      handlesZakat: true,
      handlesGiftAid: false,
    },
  });
  await prisma.trustee.createMany({
    data: [
      { masjidId: pendingMasjid.id, fullName: 'Usman Tariq', email: 'masjid-pending@example.com', role: 'CHAIR' },
      { masjidId: pendingMasjid.id, fullName: 'Sara Iqbal', email: 'sara@alhuda.example', role: 'SECRETARY' },
    ],
  });
  await prisma.uploadedDocument.create({
    data: {
      masjidId: pendingMasjid.id,
      uploaderId: pendingOwner.id,
      originalName: 'constitution.pdf',
      storedName: 'seed-constitution.pdf',
      mimeType: 'application/pdf',
      size: 18432,
      purpose: 'CONSTITUTION',
      filePath: 'uploads/seed-constitution.pdf',
    },
  });

  
  const draftOwner = await prisma.user.create({
    data: {
      email: 'masjid-draft@example.com',
      password: passwordHash,
      name: 'Hassan Ali',
      role: Role.MASJID_ADMIN,
    },
  });
  await prisma.masjid.create({
    data: {
      name: 'Masjid Al-Ihsan',
      ownerId: draftOwner.id,
      registrationStep: 2,
      status: RegistrationStatus.DRAFT,
      email: 'masjid-draft@example.com',
      address: '88 DHA Phase 6',
      city: 'Lahore',
      country: 'PK',
      organizationType: 'COMMUNITY_CENTER',
      description: 'In-progress registration.',
    },
  });

  console.log('✅ Seed complete.');
  console.log(`   All seeded accounts use password: ${SEED_PASSWORD}`);
  console.log('   Admin login: admin@mymasjid.org');
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
