import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { HeadObjectCommand, PutObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('S3_BUCKET') || 'eubp-evidence';
    this.s3 = new S3Client({
      region: this.config.get<string>('S3_REGION') || 'eu-central-1',
      endpoint: this.config.get<string>('S3_ENDPOINT') || undefined,
      forcePathStyle: this.config.get('S3_FORCE_PATH_STYLE') === 'true',
      credentials: this.config.get('S3_ACCESS_KEY') ? { accessKeyId:this.config.get<string>('S3_ACCESS_KEY')!, secretAccessKey:this.config.get<string>('S3_SECRET_KEY')! } : undefined,
    });
  }
  evidenceKey(organisationId:string,evidenceId:string,filename:string){const safe=filename.replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-180)||'evidence.bin';return `orgs/${organisationId}/evidence/${evidenceId}/${safe}`;}
  checksumBase64(sha256Hex:string){return Buffer.from(sha256Hex,'hex').toString('base64');}
  checksumHex(base64:string){return Buffer.from(base64,'base64').toString('hex');}
  async createUploadUrl(input:{objectKey:string;mimeType:string;sizeBytes:number;sha256:string}){const checksum=this.checksumBase64(input.sha256);const command=new PutObjectCommand({Bucket:this.bucket,Key:input.objectKey,ContentType:input.mimeType,ContentLength:input.sizeBytes,ChecksumSHA256:checksum,Metadata:{sha256:input.sha256},ServerSideEncryption:this.config.get('S3_ENDPOINT')?undefined:'aws:kms'});const expiresIn=Number(this.config.get('S3_UPLOAD_URL_TTL_SECONDS')||900);return {url:await getSignedUrl(this.s3,command,{expiresIn,unhoistableHeaders:new Set(['x-amz-checksum-sha256','x-amz-meta-sha256']),signableHeaders:new Set(['content-type'])}),checksumBase64:checksum,expiresIn};}
  async createDownloadUrl(objectKey:string,expiresIn=300){return getSignedUrl(this.s3,new GetObjectCommand({Bucket:this.bucket,Key:objectKey}),{expiresIn});}
  async head(objectKey:string){return this.s3.send(new HeadObjectCommand({Bucket:this.bucket,Key:objectKey}));}
  async hashObject(objectKey:string,etag?:string){const result=await this.s3.send(new GetObjectCommand({Bucket:this.bucket,Key:objectKey,IfMatch:etag}));if(!result.Body)throw new Error('Object body unavailable for integrity verification');const hash=createHash('sha256');for await(const chunk of result.Body as any)hash.update(chunk);return hash.digest('hex');}
  async verifyObjectSha256(objectKey:string,expectedHex:string,expectedSize?:number){
    try {
      const head=await this.head(objectKey);
      if(expectedSize!==undefined&&head.ContentLength!==expectedSize)throw new ConflictException({code:'UPLOAD_SIZE_MISMATCH'});
      if(!head.ETag)throw new ConflictException({code:'UPLOAD_METADATA_REQUIRED'});
      // Hash the actual stored bytes. Metadata or a caller-declared checksum is not proof.
      // If-Match binds this GET to the object inspected by HEAD.
      const actualHex=await this.hashObject(objectKey,head.ETag);
      return {ok:actualHex.toLowerCase()===expectedHex.toLowerCase(),actualHex,head};
    }catch(error:any){
      if(error?.$metadata?.httpStatusCode===404)throw new ConflictException({code:'UPLOAD_NOT_FOUND'});
      if(error?.$metadata?.httpStatusCode===412)throw new ConflictException({code:'UPLOAD_CHANGED_DURING_VERIFICATION'});
      throw error;
    }
  }
}
