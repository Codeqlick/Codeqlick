import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import {
  idParamSchema,
  slugParamSchema,
  type IdParam,
  type SlugParam,
} from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Paginated } from '../../common/types/paginated.js';
import {
  bboxQuerySchema,
  onboardingSchema,
  placeParamsSchema,
  profileSchema,
  reportSchema,
  reviewSchema,
  reviewsQuerySchema,
  searchQuerySchema,
  spotPatchSchema,
  spotSchema,
  takedownSchema,
  type BboxQuery,
  type OnboardingInput,
  type PlaceParams,
  type ProfileInput,
  type ReportInput,
  type ReviewInput,
  type ReviewsQuery,
  type SearchQuery,
  type SpotInput,
  type SpotPatch,
  type TakedownInput,
} from './cruising.schemas.js';
import {
  CruisingService,
  type CruisingPlaceMatch,
  type CruisingReviewView,
  type CruisingSpotPublic,
  type CruisingSpotSummary,
  type CruisingStatus,
} from './cruising.service.js';
import { Realm } from '../../common/decorators/realm.decorator.js';

/** What anyone can do: browse the map, the spots and the places, and ask for a removal. */
@ApiTags('cruising')
@Public()
@Realm('NEOQLICK')
@Controller('cruising')
export class CruisingPublicController {
  constructor(private readonly cruising: CruisingService) {}

  /** Up to 500 LIVE spots in a box, best rated first. */
  @Get('spots')
  @Header('Cache-Control', 'public, max-age=60')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  spots(
    @Query({ schema: bboxQuerySchema }) query: BboxQuery,
  ): Promise<{ items: CruisingSpotSummary[]; truncated: boolean }> {
    return this.cruising.spotsInBox(query.bbox, query.type, query.minRating, query.tags);
  }

  /** Cities and spots by text (phase 3, decision 86), up to 8 of each. */
  @Get('search')
  @Header('Cache-Control', 'public, max-age=60')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  search(
    @Query({ schema: searchQuerySchema }) query: SearchQuery,
  ): Promise<{ places: CruisingPlaceMatch[]; spots: CruisingSpotSummary[] }> {
    return this.cruising.search(query.q);
  }

  @Get('spots/:slug')
  spot(@Param({ schema: slugParamSchema }) params: SlugParam): Promise<CruisingSpotPublic> {
    return this.cruising.spotBySlug(params.slug);
  }

  @Get('places')
  places() {
    return this.cruising.places();
  }

  @Get('places/:countryCode/:citySlug')
  city(@Param({ schema: placeParamsSchema }) params: PlaceParams) {
    return this.cruising.cityPage(params.countryCode, params.citySlug);
  }

  @Get('sitemap')
  sitemap() {
    return this.cruising.sitemap();
  }

  /** A removal request (EU Digital Services Act): no account needed. */
  @Post('takedown')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  takedown(@Body({ schema: takedownSchema }) body: TakedownInput): Promise<{ id: string }> {
    return this.cruising.takedown(body);
  }
}

/** Cruising for its members (architecture 4.15): any signed-in account. */
@ApiTags('cruising')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Realm('NEOQLICK')
@Controller('cruising')
export class CruisingController {
  constructor(private readonly cruising: CruisingService) {}

  @Get('me')
  status(@CurrentUser() user: AuthUser): Promise<CruisingStatus> {
    return this.cruising.status(user.id);
  }

  /** Confirms 18+ (the date of birth is checked, not stored), the rules and the consent. */
  @Put('me')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  onboard(
    @CurrentUser() user: AuthUser,
    @Body({ schema: onboardingSchema }) body: OnboardingInput,
  ): Promise<CruisingStatus> {
    return this.cruising.onboard(user.id, body);
  }

  @Patch('profile')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body({ schema: profileSchema }) body: ProfileInput,
  ) {
    return this.cruising.updateProfile(user.id, body, new Date(), user.role);
  }

  @Get('me/spots')
  mySpots(@CurrentUser() user: AuthUser) {
    return this.cruising.mySpots(user.id);
  }

  @Post('spots')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  propose(@CurrentUser() user: AuthUser, @Body({ schema: spotSchema }) body: SpotInput) {
    return this.cruising.proposeSpot(user.id, body);
  }

  @Patch('spots/:id')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  editSpot(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: spotPatchSchema }) body: SpotPatch,
  ) {
    return this.cruising.editSpot(user.id, params.id, body);
  }

  @Delete('spots/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSpot(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.cruising.deleteSpot(user.id, params.id);
  }

  @Get('spots/:id/reviews')
  reviews(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Query({ schema: reviewsQuerySchema }) query: ReviewsQuery,
  ): Promise<Paginated<CruisingReviewView>> {
    return this.cruising.reviews(user.id, params.id, query.page, query.pageSize);
  }

  @Put('spots/:id/review')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  saveReview(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: reviewSchema }) body: ReviewInput,
  ): Promise<CruisingReviewView> {
    return this.cruising.saveReview(user.id, params.id, body);
  }

  @Delete('spots/:id/review')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteReview(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.cruising.deleteReview(user.id, params.id);
  }

  @Post('reports')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  report(
    @CurrentUser() user: AuthUser,
    @Body({ schema: reportSchema }) body: ReportInput,
  ): Promise<void> {
    return this.cruising.report(user.id, body);
  }
}
