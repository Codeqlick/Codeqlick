import {
  StatusUpdatePage,
  statusUpdateMetadata,
  type StatusUpdatePageProps,
} from '../StatusUpdatePage';

export const generateMetadata = (props: StatusUpdatePageProps) =>
  statusUpdateMetadata('unsubscribe', props);

/** Unsubscribing from a status page's emails, from the link in each one (decision 105). */
export default function UnsubscribeStatusPage(props: StatusUpdatePageProps) {
  return StatusUpdatePage('unsubscribe', props);
}
