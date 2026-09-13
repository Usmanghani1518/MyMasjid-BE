import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { config } from '@/config';
import { AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';

const assertConfigured = () => {
  if (!config.CLOUDINARY_CLOUD_NAME || !config.CLOUDINARY_API_KEY || !config.CLOUDINARY_API_SECRET) {
    throw new AppError('Cloudinary is not configured', 503, true, ErrorCodes.CLOUDINARY_NOT_CONFIGURED);
  }
  cloudinary.config({
    cloud_name: config.CLOUDINARY_CLOUD_NAME,
    api_key: config.CLOUDINARY_API_KEY,
    api_secret: config.CLOUDINARY_API_SECRET,
    secure: true,
  });
};

export const uploadCampaignMedia = async (buffer: Buffer, mimeType: string): Promise<UploadApiResponse> => {
  assertConfigured();
  const resourceType = mimeType === 'video/mp4' ? 'video' : 'image';
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'mymasjid/campaigns', resource_type: resourceType },
      (error, result) => (error || !result ? reject(error ?? new Error('Upload failed')) : resolve(result)),
    );
    stream.end(buffer);
  });
};
