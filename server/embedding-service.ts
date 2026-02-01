import crypto from 'crypto';

const JINA_API_URL = 'https://api.jina.ai/v1/embeddings';
const EMBEDDING_MODEL = 'jina-clip-v1';
const EMBEDDING_DIMENSIONS = 768;

export interface EmbeddingResult {
  embedding: number[];
  hash: string;
}

export interface ImageQualityResult {
  score: number;
  width: number;
  height: number;
  passesThreshold: boolean;
}

export async function generateImageEmbedding(
  imageInput: string | Buffer,
  apiKey?: string
): Promise<EmbeddingResult> {
  const key = apiKey || process.env.JINA_API_KEY;
  
  if (!key) {
    throw new Error('JINA_API_KEY is required for image embeddings');
  }

  let imageData: string;
  let imageBytes: Buffer;

  if (typeof imageInput === 'string') {
    if (imageInput.startsWith('http://') || imageInput.startsWith('https://')) {
      const response = await fetch(imageInput);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      imageBytes = Buffer.from(await response.arrayBuffer());
      imageData = imageBytes.toString('base64');
    } else if (imageInput.startsWith('data:')) {
      const base64Data = imageInput.split(',')[1];
      imageBytes = Buffer.from(base64Data, 'base64');
      imageData = base64Data;
    } else {
      imageBytes = Buffer.from(imageInput, 'base64');
      imageData = imageInput;
    }
  } else {
    imageBytes = imageInput;
    imageData = imageInput.toString('base64');
  }

  const hash = crypto.createHash('sha256').update(imageBytes).digest('hex');

  const requestBody = {
    model: EMBEDDING_MODEL,
    input: [{ image: `data:image/jpeg;base64,${imageData}` }],
  };

  const response = await fetch(JINA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    // Sanitize HTML error pages from response
    const cleanError = errorText.includes('<!DOCTYPE') || errorText.includes('<html') 
      ? response.statusText || 'API error'
      : errorText.slice(0, 200);
    throw new Error(`Jina API error: ${response.status} - ${cleanError}`);
  }

  const result = await response.json();
  
  if (!result.data || !result.data[0] || !result.data[0].embedding) {
    throw new Error('Invalid response from Jina API: missing embedding');
  }

  return {
    embedding: result.data[0].embedding,
    hash,
  };
}

export async function generateTextEmbedding(
  text: string,
  apiKey?: string
): Promise<number[]> {
  const key = apiKey || process.env.JINA_API_KEY;
  
  if (!key) {
    throw new Error('JINA_API_KEY is required for text embeddings');
  }

  const requestBody = {
    model: EMBEDDING_MODEL,
    input: [{ text }],
  };

  const response = await fetch(JINA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    // Sanitize HTML error pages from response
    const cleanError = errorText.includes('<!DOCTYPE') || errorText.includes('<html') 
      ? response.statusText || 'API error'
      : errorText.slice(0, 200);
    throw new Error(`Jina API error: ${response.status} - ${cleanError}`);
  }

  const result = await response.json();
  
  if (!result.data || !result.data[0] || !result.data[0].embedding) {
    throw new Error('Invalid response from Jina API: missing embedding');
  }

  return result.data[0].embedding;
}

export function assessImageQuality(
  width: number,
  height: number,
  blurScore?: number,
  brightness?: number
): ImageQualityResult {
  let score = 1.0;

  const minDimension = Math.min(width, height);
  if (minDimension < 200) {
    score *= 0.3;
  } else if (minDimension < 400) {
    score *= 0.6;
  } else if (minDimension < 500) {
    score *= 0.8;
  }

  const aspectRatio = Math.max(width, height) / Math.min(width, height);
  if (aspectRatio > 3) {
    score *= 0.5;
  } else if (aspectRatio > 2) {
    score *= 0.8;
  }

  if (blurScore !== undefined) {
    if (blurScore < 50) {
      score *= 0.4;
    } else if (blurScore < 100) {
      score *= 0.7;
    }
  }

  if (brightness !== undefined) {
    if (brightness < 30 || brightness > 240) {
      score *= 0.5;
    } else if (brightness < 50 || brightness > 220) {
      score *= 0.8;
    }
  }

  return {
    score: Math.round(score * 100) / 100,
    width,
    height,
    passesThreshold: score >= 0.55,
  };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

export function distanceToSimilarity(distance: number): number {
  return Math.max(0, 1 - distance);
}

export { EMBEDDING_DIMENSIONS };
