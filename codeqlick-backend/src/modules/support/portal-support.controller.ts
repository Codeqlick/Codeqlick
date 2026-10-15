import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Paginated } from '../../common/types/paginated.js';
import { attachmentDisposition } from '../projects/project-file-name.js';
import type { UploadedProjectFile } from '../projects/projects.service.js';
import {
  createTicketSchema,
  ticketFileParamSchema,
  type TicketFileParam,
  listTicketsQuerySchema,
  ticketMessageSchema,
  type CreateTicketInput,
  type ListTicketsQuery,
  type TicketMessageInput,
} from './support.schemas.js';
import {
  MAX_TICKET_FILE_BYTES,
  SupportService,
  type TicketDetail,
  type TicketSummary,
} from './support.service.js';

@ApiTags('portal')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('portal/tickets')
export class PortalSupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listTicketsQuerySchema }) query: ListTicketsQuery,
  ): Promise<Paginated<TicketSummary>> {
    return this.support.listMine(user, query);
  }

  @Post()
  open(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createTicketSchema }) body: CreateTicketInput,
  ): Promise<TicketDetail> {
    return this.support.open(user, body);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<TicketDetail> {
    return this.support.getMine(user, params.id);
  }

  @Post(':id/messages')
  reply(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: ticketMessageSchema }) body: TicketMessageInput,
  ): Promise<TicketDetail> {
    return this.support.replyAsClient(user, params.id, body);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  close(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<TicketDetail> {
    return this.support.close(user, params.id);
  }

  /** The client (or an admin) adds a file; 409 once the request is closed. */
  @Post(':id/files')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_TICKET_FILE_BYTES, files: 1 },
      // Browsers send UTF-8 file names; multer would otherwise read them as Latin-1.
      defParamCharset: 'utf8',
    }),
  )
  addFile(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @UploadedFile() file: UploadedProjectFile | undefined,
  ): Promise<TicketDetail> {
    return this.support.addFile(user, params.id, file);
  }

  /** Always an attachment of a generic type, so an uploaded HTML or SVG file can't run here. */
  @Get(':id/files/:fileId')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async downloadFile(
    @CurrentUser() user: AuthUser,
    @Param({ schema: ticketFileParamSchema }) params: TicketFileParam,
  ): Promise<StreamableFile> {
    const file = await this.support.downloadFile(user, params.id, params.fileId);
    return new StreamableFile(file.stream, {
      type: 'application/octet-stream',
      length: file.size,
      disposition: attachmentDisposition(file.name),
    });
  }
}
