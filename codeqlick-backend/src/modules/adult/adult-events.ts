import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import type { AdultApp } from '../../generated/prisma/client.js';

/** Two people now blocked in the three apps (decision 112). */
export interface AdultBlockedEvent {
  a: string;
  b: string;
  sourceApp: AdultApp;
}

/** The verification of an account was decided or withdrawn (decision 113). */
export interface AdultVerificationEvent {
  userId: string;
  status: 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
}

/**
 * In-process events of the shared safety (architecture 4.16), sent after the change is committed:
 * the app modules listen to act on what lives in memory or in their own services (the video chat
 * gateway ends a call between two people now blocked or disconnects someone suspended; Cruising
 * writes the decision in its notification centre).
 */
@Injectable()
export class AdultEvents {
  readonly blocked = new Subject<AdultBlockedEvent>();
  readonly suspended = new Subject<string>();
  readonly verification = new Subject<AdultVerificationEvent>();
}
