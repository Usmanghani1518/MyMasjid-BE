import { prisma } from '@/config/database';
import { config } from '@/config';
import { encryptSensitive, isEncryptedSensitiveValue } from '@/services/crypto.service';

const requireConfirmation = (): void => {
  if (process.env.CONFIRM_SENSITIVE_DATA_ENCRYPTION !== 'true') {
    throw new Error('Set CONFIRM_SENSITIVE_DATA_ENCRYPTION=true to update stored identifiers.');
  }
};

const run = async (): Promise<void> => {
  requireConfirmation();
  if (!config.ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY must be configured.');
  let encryptedCount = 0;

  const trustees = await prisma.trustee.findMany({
    where: { idNumberEnc: { not: null } },
    select: { id: true, idNumberEnc: true },
    orderBy: { id: 'asc' },
  });
  for (const trustee of trustees) {
    if (!trustee.idNumberEnc || isEncryptedSensitiveValue(trustee.idNumberEnc)) continue;
    await prisma.trustee.update({
      where: { id: trustee.id },
      data: { idNumberEnc: encryptSensitive(trustee.idNumberEnc) },
    });
    encryptedCount += 1;
  }

  const donors = await prisma.donor.findMany({
    where: { idNumberEnc: { not: null } },
    select: { id: true, idNumberEnc: true },
    orderBy: { id: 'asc' },
  });
  for (const donor of donors) {
    if (!donor.idNumberEnc || isEncryptedSensitiveValue(donor.idNumberEnc)) continue;
    await prisma.donor.update({
      where: { id: donor.id },
      data: { idNumberEnc: encryptSensitive(donor.idNumberEnc) },
    });
    encryptedCount += 1;
  }

  const volunteers = await prisma.volunteer.findMany({
    where: { idNumberEnc: { not: null } },
    select: { id: true, idNumberEnc: true },
    orderBy: { id: 'asc' },
  });
  for (const volunteer of volunteers) {
    if (!volunteer.idNumberEnc || isEncryptedSensitiveValue(volunteer.idNumberEnc)) continue;
    await prisma.volunteer.update({
      where: { id: volunteer.id },
      data: { idNumberEnc: encryptSensitive(volunteer.idNumberEnc) },
    });
    encryptedCount += 1;
  }

  console.info(`Encrypted ${encryptedCount} sensitive identifiers.`);
};

run()
  .catch((error: unknown) => {
    const errorType = error instanceof Error ? error.name : 'UnknownError';
    console.error(`Sensitive identifier encryption failed (${errorType}).`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
