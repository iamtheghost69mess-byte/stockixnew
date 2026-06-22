import { Inject, Injectable } from '@nestjs/common';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { S3_CLIENT } from '../S3/S3.module';
import { Readable } from 'stream';

@Injectable()
export class GetAttachmentBase64 {
  constructor(
    private readonly configService: ConfigService,

    @Inject(S3_CLIENT)
    private readonly s3Client: S3Client,
  ) {}

  /**
   * Retrieves the given attachment key as a Base64 data URI.
   * @param {string} key - 
   * @returns {string} Data URI (e.g., data:image/png;base64,...)
   */
  async getBase64(key: string): Promise<string> {
    const config = this.configService.get('s3');

    const command = new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    });
    
    const response = await this.s3Client.send(command);
    const stream = response.Body as Readable;

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });

    const base64 = buffer.toString('base64');
    const contentType = response.ContentType || 'image/png';
    return `data:${contentType};base64,${base64}`;
  }
}
