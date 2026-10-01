'use client';

import { BLOCK_COMPONENTS } from '@/components/blocks/Blocks';
import { themeAttributes, themeToCssVars } from '@/lib/design/theme';
import ImageField from './ImageField';

/**
 * Puck config for the EDITOR: the storefront's own block components, plus
 * fields, defaults and labels.
 *
 * Field limits mirror lib/design/blocks.ts so a seller meets a limit while
 * typing rather than as a refused save — but the server schema is the one
 * that decides. Links are typed as paths, and the server refuses anything
 * that is not an internal path.
 */

const text = (label, contentEditable = false) => ({ type: 'text', label, contentEditable });
const textarea = (label) => ({ type: 'textarea', label });
const internalLink = (label) => ({ type: 'text', label: `${label} (a page in your store, like /shop)` });

function imageField(siteId, label = 'Photo') {
  return {
    type: 'custom',
    label,
    render: ({ value, onChange }) => <ImageField value={value} onChange={onChange} siteId={siteId} label={label} />,
  };
}

/**
 * Rich text uses Puck's own editor, limited to the marks the server keeps
 * (bold, italic, underline, lists, links). Anything else it might produce is
 * stripped by DOMPurify on save.
 */
const rich = (label) => ({
  type: 'richtext',
  label,
  options: { heading: false, blockquote: false, code: false, codeBlock: false, horizontalRule: false },
});

export function buildEditorConfig(siteId) {
  const C = BLOCK_COMPONENTS;

  return {
    root: {
      // No page-level fields: the store's name and theme come from elsewhere.
      fields: {},
      // The preview wears the theme being edited, passed in as metadata, so
      // colour, font, look and mode changes show in the canvas immediately.
      // For "match device" the seller chooses which half to preview
      // (metadata.previewDark) rather than having it depend on their own
      // phone or laptop setting.
      render: ({ children, puck }) => {
        const theme = puck?.metadata?.theme;
        const attributes = theme ? themeAttributes(theme) : { 'data-buttons': 'solid' };
        if (theme?.mode === 'auto') attributes['data-mode'] = puck?.metadata?.previewDark ? 'dark' : 'light';
        return (
          <div className="shell storefront storefront--themed" style={theme ? themeToCssVars(theme) : undefined} {...attributes}>
            {children}
          </div>
        );
      },
    },
    categories: {
      top: { title: 'Top of page', components: ['AnnouncementBar', 'Hero'] },
      selling: { title: 'Selling', components: ['FeaturedProducts', 'CategoryGrid'] },
      story: { title: 'Trust and story', components: ['Testimonials', 'ImageText', 'FAQ', 'ContactWhatsApp'] },
    },
    components: {
      AnnouncementBar: {
        label: 'Announcement bar',
        fields: {
          text: text('Message', true),
          href: internalLink('Link'),
          tone: {
            type: 'radio',
            label: 'Colour',
            options: [
              { label: 'Brand', value: 'accent' },
              { label: 'Dark', value: 'dark' },
              { label: 'Soft', value: 'soft' },
            ],
          },
        },
        defaultProps: { text: 'Free delivery within Lagos on orders over ₦50,000', href: '', tone: 'accent' },
        render: C.AnnouncementBar,
      },
      Hero: {
        label: 'Hero with image',
        fields: {
          heading: text('Heading', true),
          subheading: textarea('Subheading'),
          image: imageField(siteId, 'Background photo'),
          ctaLabel: text('Button text'),
          ctaHref: internalLink('Button link'),
          align: {
            type: 'radio',
            label: 'Text position',
            options: [
              { label: 'Left', value: 'left' },
              { label: 'Centre', value: 'center' },
            ],
          },
        },
        defaultProps: {
          heading: 'New stock, this week',
          subheading: 'Pay by card, bank transfer or USSD. Delivered to your door.',
          image: null,
          ctaLabel: 'Shop now',
          ctaHref: '/shop',
          align: 'left',
        },
        render: C.Hero,
      },
      FeaturedProducts: {
        label: 'Featured products',
        fields: {
          heading: text('Heading', true),
          count: {
            type: 'radio',
            label: 'How many',
            options: [
              { label: '3', value: 3 },
              { label: '6', value: 6 },
              { label: '9', value: 9 },
            ],
          },
        },
        defaultProps: { heading: 'New in', count: 6 },
        render: C.FeaturedProducts,
      },
      CategoryGrid: {
        label: 'Category grid',
        fields: {
          heading: text('Heading', true),
          tiles: {
            type: 'array',
            label: 'Categories',
            max: 8,
            getItemSummary: (item) => item?.label || 'Category',
            arrayFields: {
              label: text('Name'),
              href: internalLink('Link'),
              image: imageField(siteId, 'Photo'),
            },
            defaultItemProps: { label: 'New arrivals', href: '/shop', image: null },
          },
        },
        defaultProps: {
          heading: 'Shop by category',
          tiles: [
            { label: 'New arrivals', href: '/shop', image: null },
            { label: 'Best sellers', href: '/shop', image: null },
          ],
        },
        render: C.CategoryGrid,
      },
      Testimonials: {
        label: 'Testimonials',
        fields: {
          heading: text('Heading', true),
          items: {
            type: 'array',
            label: 'Reviews',
            max: 6,
            getItemSummary: (item) => item?.name || 'Customer',
            arrayFields: {
              quote: textarea('What they said'),
              name: text('Name'),
              location: text('Where (optional)'),
            },
            defaultItemProps: { quote: 'Arrived the next day and fits perfectly.', name: 'Bisi', location: 'Ikeja' },
          },
        },
        defaultProps: {
          heading: 'What customers say',
          items: [{ quote: 'Arrived the next day and fits perfectly.', name: 'Bisi', location: 'Ikeja' }],
        },
        render: C.Testimonials,
      },
      ImageText: {
        label: 'Image and text',
        fields: {
          heading: text('Heading', true),
          body: rich('Text'),
          image: imageField(siteId, 'Photo'),
          imageSide: {
            type: 'radio',
            label: 'Photo side',
            options: [
              { label: 'Left', value: 'left' },
              { label: 'Right', value: 'right' },
            ],
          },
        },
        defaultProps: {
          heading: 'Made in Lagos',
          body: '<p>Tell customers who you are and how you make what you sell.</p>',
          image: null,
          imageSide: 'left',
        },
        render: C.ImageText,
      },
      FAQ: {
        label: 'Questions (FAQ)',
        fields: {
          heading: text('Heading', true),
          items: {
            type: 'array',
            label: 'Questions',
            max: 12,
            getItemSummary: (item) => item?.question || 'Question',
            arrayFields: {
              question: text('Question'),
              answer: rich('Answer'),
            },
            defaultItemProps: { question: 'How long does delivery take?', answer: '<p>1–2 days in Lagos.</p>' },
          },
        },
        defaultProps: {
          heading: 'Questions',
          items: [{ question: 'How long does delivery take?', answer: '<p>1–2 days in Lagos, 3–5 days elsewhere.</p>' }],
        },
        render: C.FAQ,
      },
      ContactWhatsApp: {
        label: 'WhatsApp button',
        fields: {
          heading: text('Heading', true),
          text: textarea('Text'),
          phone: text('WhatsApp number, digits only (2348012345678)'),
          prefill: text('Message to start the chat'),
          buttonLabel: text('Button text'),
        },
        defaultProps: {
          heading: 'Order on WhatsApp',
          text: 'Prefer to chat first? Message us and we will reply within the hour.',
          phone: '2348000000000',
          prefill: 'Hello, I saw your store on HordeMart',
          buttonLabel: 'Chat on WhatsApp',
        },
        render: C.ContactWhatsApp,
      },
    },
  };
}
