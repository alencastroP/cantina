import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { uuidv7 } from 'uuidv7';

import { env } from '../config/env';
import { AppError } from '../http/errors/app-error';
import { logger } from '../shared/logger';

/**
 * Storage de imagens de produto (P9).
 *
 * Upload por URL pré-assinada: o browser envia o arquivo direto ao bucket,
 * sem passar pela API. Isso mantém a API fora do caminho de dados pesados e
 * dispensa aumentar o limite de 1 MB do corpo das requisições.
 *
 * A assinatura é computação local — não há chamada de rede ao gerar a URL,
 * o que também a torna testável sem bucket nenhum.
 */

export interface PresignedUpload {
  uploadUrl: string;
  /** URL pública definitiva. É esta que vai para `product_images.url`. */
  publicUrl: string;
  expiresInSeconds: number;
}

export interface PresignInput {
  tenantId: string;
  contentType: string;
  contentLength: number;
  /** Ex.: `products`, `logos`. Vira parte da chave no bucket. */
  folder: string;
}

export interface StorageProvider {
  readonly name: string;
  readonly configured: boolean;
  presignUpload(input: PresignInput): Promise<PresignedUpload>;
  delete(publicUrl: string): Promise<void>;
}

const UPLOAD_TTL_SECONDS = 300;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

function publicBase(): string {
  return (env.STORAGE_PUBLIC_URL ?? `${env.STORAGE_ENDPOINT}/${env.STORAGE_BUCKET}`).replace(
    /\/+$/,
    '',
  );
}

function createClient(): S3Client {
  return new S3Client({
    region: env.STORAGE_REGION,
    ...(env.STORAGE_ENDPOINT ? { endpoint: env.STORAGE_ENDPOINT } : {}),
    // MinIO e a maioria dos S3-compatíveis servem por path, não por
    // subdomínio de bucket.
    forcePathStyle: Boolean(env.STORAGE_ENDPOINT),
    credentials: {
      accessKeyId: env.STORAGE_ACCESS_KEY_ID!,
      secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY!,
    },
  });
}

function s3Provider(): StorageProvider {
  const client = createClient();

  return {
    name: 's3',
    configured: true,

    async presignUpload({ tenantId, contentType, contentLength, folder }) {
      const extension = EXTENSIONS[contentType];
      if (!extension) {
        throw new AppError(422, 'unsupported_media_type', `Formato não aceito: ${contentType}`);
      }

      // O `tenantId` abre a chave: mantém os arquivos de cada empresa
      // separados no bucket, o que torna trivial exportar ou apagar tudo de
      // um cliente (LGPD, D24).
      const key = `${tenantId}/${folder}/${uuidv7()}.${extension}`;

      const uploadUrl = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: env.STORAGE_BUCKET,
          Key: key,
          ContentType: contentType,
          // Assinar o tamanho impede que a URL seja usada para subir um
          // arquivo muito maior que o anunciado.
          ContentLength: contentLength,
        }),
        { expiresIn: UPLOAD_TTL_SECONDS },
      );

      return {
        uploadUrl,
        publicUrl: `${publicBase()}/${key}`,
        expiresInSeconds: UPLOAD_TTL_SECONDS,
      };
    },

    async delete(publicUrl) {
      const base = `${publicBase()}/`;
      if (!publicUrl.startsWith(base)) {
        // Recusar URL de fora é o que impede que um `url` gravado à mão no
        // banco vire uma exclusão arbitrária no bucket.
        throw new AppError(422, 'invalid_storage_url', 'Esta URL não pertence ao storage.');
      }

      await client.send(
        new DeleteObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: publicUrl.slice(base.length) }),
      );
    },
  };
}

const unconfigured = (): never => {
  throw new AppError(
    503,
    'storage_not_configured',
    'Storage de imagens não configurado. Defina STORAGE_ACCESS_KEY_ID e STORAGE_SECRET_ACCESS_KEY.',
    { expected: false },
  );
};

const nullProvider: StorageProvider = {
  name: 'none',
  configured: false,
  presignUpload: () => unconfigured(),
  delete: () => unconfigured(),
};

const hasCredentials = Boolean(env.STORAGE_ACCESS_KEY_ID && env.STORAGE_SECRET_ACCESS_KEY);

export const storageProvider: StorageProvider = hasCredentials ? s3Provider() : nullProvider;

if (!hasCredentials) {
  logger.warn('Storage sem credenciais: upload de imagem responde 503 até configurar.');
}
