import { Module } from '@nestjs/common';
import { SiteBuilderClient } from './site-builder.client.js';

/** The site-builder client, shared by managed sites and projects (deleting one takes its site down). */
@Module({ providers: [SiteBuilderClient], exports: [SiteBuilderClient] })
export class SiteBuilderModule {}
