import {
  StatusUpdatePage,
  statusUpdateMetadata,
  type StatusUpdatePageProps,
} from '../StatusUpdatePage';

export const generateMetadata = (props: StatusUpdatePageProps) =>
  statusUpdateMetadata('confirm', props);

/** "Confirm your subscription" of a status page's emails (decision 105). */
export default function ConfirmStatusSubscriptionPage(props: StatusUpdatePageProps) {
  return StatusUpdatePage('confirm', props);
}
