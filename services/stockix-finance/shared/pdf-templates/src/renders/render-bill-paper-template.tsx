import {
  BillPaperTemplate,
  BillPaperTemplateProps,
} from '../components/BillPaperTemplate';
import { renderSSR } from './render-ssr';

/**
 * Renders bill paper template html.
 * @param {BillPaperTemplateProps} props
 * @returns {string}
 */
export const renderBillPaperTemplateHtml = (
  props: BillPaperTemplateProps,
) => {
  return renderSSR(<BillPaperTemplate {...props} />);
};
