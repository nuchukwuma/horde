/**
 * Demo stock for the landing page's "launch your store" preview.
 *
 * Named and priced like things actually sold through WhatsApp in Nigeria, so
 * a seller recognises their own trade. Prices are illustrative, in kobo.
 * Each category also carries the cloth colours its preview is dyed in.
 */
export const DEMO_CATEGORIES = [
  {
    id: 'fashion',
    label: 'Fashion & fabric',
    ink: '#22307a',
    resist: '#f4f1e6',
    accent: '#22307a',
    accentInk: '#ffffff',
    products: [
      { title: 'Adire kampala, 2 yards', priceKobo: 1_850_000 },
      { title: 'Ankara bubu gown', priceKobo: 2_400_000 },
      { title: 'Aso-oke gele, wine', priceKobo: 1_200_000 },
    ],
  },
  {
    id: 'food',
    label: 'Food & drinks',
    ink: '#8f3a22',
    resist: '#fbeee2',
    accent: '#b4472a',
    accentInk: '#ffffff',
    products: [
      { title: 'Zobo drink, 1 litre', priceKobo: 150_000 },
      { title: 'Party jollof rice tray', priceKobo: 3_500_000 },
      { title: 'Suya spice, 250g', priceKobo: 280_000 },
    ],
  },
  {
    id: 'gadgets',
    label: 'Phones & gadgets',
    ink: '#0e4e5c',
    resist: '#e3f2f2',
    accent: '#0e5e6f',
    accentInk: '#ffffff',
    products: [
      { title: 'Fast charger, 20W', priceKobo: 850_000 },
      { title: 'Wireless earbuds', priceKobo: 2_200_000 },
      { title: 'Android phone, 128GB', priceKobo: 18_500_000 },
    ],
  },
  {
    id: 'beauty',
    label: 'Beauty',
    ink: '#5b2550',
    resist: '#f7e8f1',
    accent: '#6b2d5c',
    accentInk: '#ffffff',
    products: [
      { title: 'Whipped shea butter', priceKobo: 420_000 },
      { title: 'Black soap, 500g', priceKobo: 300_000 },
      { title: 'Coral bead necklace', priceKobo: 780_000 },
    ],
  },
];
