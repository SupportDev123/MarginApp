import { db } from './db';
import { libraryItems, libraryImages } from '@shared/schema';
import { eq, sql, and } from 'drizzle-orm';
import { generateImageEmbedding } from './embedding-service';
import { Storage } from '@google-cloud/storage';
import crypto from 'crypto';
import sharp from 'sharp';

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

function getBucketName(): string {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    throw new Error('DEFAULT_OBJECT_STORAGE_BUCKET_ID not set');
  }
  return bucketId;
}

export interface LearnFromScanParams {
  imageBase64: string;
  category: string;
  title: string;
  brand?: string | null;
  model?: string | null;
  condition?: string | null;
  confidence: number;
  source: 'margin_live' | 'margin_pulse' | 'item_scan' | 'user_confirm';
}

export interface LearnResult {
  success: boolean;
  imageAdded: boolean;
  itemId?: number;
  reason?: string;
}

export async function learnFromConfirmedScan(params: LearnFromScanParams): Promise<LearnResult> {
  const { imageBase64, category, title, brand, model, confidence, source } = params;
  
  if (confidence < 70) {
    return { success: false, imageAdded: false, reason: 'Confidence too low (<70%)' };
  }
  
  if (!title || title.length < 3) {
    return { success: false, imageAdded: false, reason: 'Title too short' };
  }

  const normalizedCategory = normalizeCategory(category);
  if (!normalizedCategory) {
    return { success: false, imageAdded: false, reason: `Unknown category: ${category}` };
  }

  try {
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const imageHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');

    const existingImage = await db
      .select()
      .from(libraryImages)
      .where(eq(libraryImages.imageHash, imageHash))
      .limit(1);

    if (existingImage.length > 0) {
      console.log(`[ScanLearning] Image already in library (hash: ${imageHash.slice(0, 8)}...)`);
      return { success: true, imageAdded: false, reason: 'Image already exists' };
    }

    let itemId = await findOrCreateLibraryItem(normalizedCategory, title, brand, model);
    
    const { embedding } = await generateImageEmbedding(imageBuffer);
    
    const jpegBuffer = await sharp(imageBuffer)
      .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    
    const metadata = await sharp(jpegBuffer).metadata();
    
    const safeTitle = title.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 50);
    const storagePath = `learned/${normalizedCategory}/${safeTitle}/${imageHash.slice(0, 16)}.jpg`;
    
    const bucketName = getBucketName();
    const bucket = storageClient.bucket(bucketName);
    const file = bucket.file(storagePath);
    
    await file.save(jpegBuffer, {
      contentType: 'image/jpeg',
      metadata: {
        cacheControl: 'public, max-age=31536000',
      },
    });
    
    const imageUrl = `https://storage.googleapis.com/${bucketName}/${storagePath}`;
    
    const [insertedImage] = await db.insert(libraryImages).values({
      itemId,
      category: normalizedCategory,
      imageUrl,
      imageHash,
      imageType: getImageType(normalizedCategory),
      source: 'user_scan',
      qualityScore: '0.8',
      width: metadata.width || 640,
      height: metadata.height || 480,
    }).returning({ id: libraryImages.id });

    await db.execute(sql`
      UPDATE library_images 
      SET embedding = ${`[${embedding.join(',')}]`}::vector
      WHERE id = ${insertedImage.id}
    `);

    console.log(`[ScanLearning] Added to library: "${title}" (${normalizedCategory}) from ${source}, stored at ${storagePath}`);
    
    return { success: true, imageAdded: true, itemId };
  } catch (error: any) {
    console.error('[ScanLearning] Error:', error.message);
    return { success: false, imageAdded: false, reason: error.message };
  }
}

async function findOrCreateLibraryItem(
  category: string, 
  title: string, 
  brand?: string | null, 
  model?: string | null
): Promise<number> {
  const normalizedTitle = title.toLowerCase().trim();
  const normalizedBrand = brand?.toLowerCase().trim() || null;
  
  const existing = await db
    .select()
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.category, category),
        eq(sql`lower(${libraryItems.title})`, normalizedTitle)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  const [newItem] = await db.insert(libraryItems).values({
    category,
    title,
    brand: normalizedBrand,
    modelName: model || null,
    attributes: {},
    status: 'active',
  }).returning({ id: libraryItems.id });

  console.log(`[ScanLearning] Created new library item: "${title}" (ID: ${newItem.id})`);
  
  return newItem.id;
}

function normalizeCategory(category: string): string | null {
  const categoryMap: Record<string, string> = {
    'watches': 'watch',
    'watch': 'watch',
    'shoes': 'shoe',
    'shoe': 'shoe',
    'trading cards': 'card',
    'cards': 'card',
    'card': 'card',
    'collectibles': 'collectible',
    'collectible': 'collectible',
    'electronics': 'electronics',
    'other': 'other',
  };
  
  return categoryMap[category.toLowerCase()] || null;
}

function getImageType(category: string): string {
  switch (category) {
    case 'watch': return 'dial';
    case 'shoe': return 'side';
    case 'card': return 'front';
    default: return 'main';
  }
}

export async function getLearnedImageCount(): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(libraryImages)
    .where(eq(libraryImages.source, 'user_scan'));
  
  return result[0]?.count || 0;
}
