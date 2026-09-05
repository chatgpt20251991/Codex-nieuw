import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'eubp:isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
