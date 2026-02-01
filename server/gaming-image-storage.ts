import { Storage } from "@google-cloud/storage";
import crypto from "crypto";
import sharp from "sharp";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

const MIN_FILE_SIZE = 20 * 1024;
const MIN_DIMENSION = 200;

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  sha256?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  contentType?: string;
  buffer?: Buffer;
}

export interface StoredImageResult {
  storagePath: string;
  sha256: string;
  width: number;
  height: number;
  fileSize: number;
  contentType: string;
}

function getBucketName(): string {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID not set");
  }
  return bucketId;
}

function sanitizePath(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9-]/g, '_').replace(/_+/g, '_');
}

export async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MarginBot/1.0)',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }
  
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`Invalid content type: ${contentType}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function validateImage(buffer: Buffer): Promise<ImageValidationResult> {
  try {
    const fileSize = buffer.length;
    
    if (fileSize < MIN_FILE_SIZE) {
      return { valid: false, error: `File too small: ${fileSize} bytes (min ${MIN_FILE_SIZE})` };
    }
    
    const metadata = await sharp(buffer).metadata();
    
    if (!metadata.width || !metadata.height) {
      return { valid: false, error: 'Could not read image dimensions' };
    }
    
    if (metadata.width < MIN_DIMENSION || metadata.height < MIN_DIMENSION) {
      return { 
        valid: false, 
        error: `Image too small: ${metadata.width}x${metadata.height} (min ${MIN_DIMENSION}x${MIN_DIMENSION})` 
      };
    }
    
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    
    const format = metadata.format || 'jpeg';
    const contentType = `image/${format === 'jpg' ? 'jpeg' : format}`;
    
    return {
      valid: true,
      sha256,
      width: metadata.width,
      height: metadata.height,
      fileSize,
      contentType,
      buffer,
    };
  } catch (error: any) {
    return { valid: false, error: `Validation failed: ${error.message}` };
  }
}

export async function storeGamingImage(
  buffer: Buffer,
  sha256: string,
  brand: string,
  family: string,
  familyId: number
): Promise<StoredImageResult | null> {
  try {
    const bucketName = getBucketName();
    const bucket = storageClient.bucket(bucketName);
    
    const jpegBuffer = await sharp(buffer)
      .jpeg({ quality: 85 })
      .toBuffer();
    
    const metadata = await sharp(jpegBuffer).metadata();
    
    const brandPath = sanitizePath(brand);
    const familyPath = sanitizePath(family);
    const storagePath = `gaming/${brandPath}/${familyPath}/${familyId}/${sha256}.jpg`;
    
    const file = bucket.file(storagePath);
    
    await file.save(jpegBuffer, {
      contentType: 'image/jpeg',
      metadata: {
        cacheControl: 'public, max-age=31536000',
      },
    });
    
    return {
      storagePath,
      sha256,
      width: metadata.width || 0,
      height: metadata.height || 0,
      fileSize: jpegBuffer.length,
      contentType: 'image/jpeg',
    };
  } catch (error: any) {
    console.error(`Failed to store gaming image: ${error.message}`);
    return null;
  }
}

export async function checkGamingImageExists(sha256: string): Promise<boolean> {
  try {
    const bucketName = getBucketName();
    const bucket = storageClient.bucket(bucketName);
    
    const [files] = await bucket.getFiles({
      prefix: 'gaming/',
      maxResults: 1,
    });
    
    for (const file of files) {
      if (file.name.includes(sha256)) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    return false;
  }
}
