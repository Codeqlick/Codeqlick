import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  publicReviewsQuerySchema,
  reviewStatusSchema,
  submitReviewSchema,
  type PublicReviewsQuery,
  type SubmitReviewInput,
} from './reviews.schemas.js';
import { ReviewsService, type PublicReview, type ReviewView } from './reviews.service.js';

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** Published reviews written in `locale`, newest first. */
  @Public()
  @Get('reviews')
  published(
    @Query({ schema: publicReviewsQuerySchema }) query: PublicReviewsQuery,
  ): Promise<PublicReview[]> {
    return this.reviews.published(query.locale, query.limit);
  }

  @ApiBearerAuth()
  @Roles('CLIENT', 'ADMIN')
  @Get('portal/projects/:id/review')
  getForClient(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<ReviewView> {
    return this.reviews.getForClient(user, params.id);
  }

  @ApiBearerAuth()
  @Roles('CLIENT', 'ADMIN')
  @Put('portal/projects/:id/review')
  submit(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: submitReviewSchema }) body: SubmitReviewInput,
  ): Promise<ReviewView> {
    return this.reviews.submit(user, params.id, body);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('admin/projects/:id/review')
  getForTeam(@Param({ schema: idParamSchema }) params: IdParam): Promise<ReviewView> {
    return this.reviews.getForTeam(params.id);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post('admin/projects/:id/review/request')
  @HttpCode(HttpStatus.OK)
  request(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<ReviewView> {
    return this.reviews.request(user, params.id);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Put('admin/projects/:id/review/status')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: reviewStatusSchema }) body: { status: 'PUBLISHED' | 'HIDDEN' },
  ): Promise<ReviewView> {
    return this.reviews.setStatus(user, params.id, body.status);
  }
}
