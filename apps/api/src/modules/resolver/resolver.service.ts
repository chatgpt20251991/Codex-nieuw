import { Injectable } from '@nestjs/common'; import { ConfigService } from '@nestjs/config'; import QRCode from 'qrcode';
@Injectable()
export class ResolverService {constructor(private readonly config:ConfigService){}
 upi(publicId:string){const base=(this.config.get<string>('RESOLVER_BASE_URL')||'http://localhost:4000/v1/public/b').replace(/\/$/,'');const url=`${base}/${encodeURIComponent(publicId)}`;if(this.config.get('NODE_ENV')==='production'&&!url.startsWith('https://'))throw new Error('Production RESOLVER_BASE_URL must use HTTPS.');return url;}
 qrSvg(upi:string){return QRCode.toString(upi,{type:'svg',errorCorrectionLevel:'M',margin:1,width:320});}
}
