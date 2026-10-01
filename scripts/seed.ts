#!/usr/bin/env node
/**
 * Development seed.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27017/hordemart npx tsx scripts/seed.ts
 *
 * Creates the two plans, one verified seller with products, posts and a
 * project, and a month of ledger history so the dashboard has a real shape
 * rather than a flat line.
 *
 * Refuses to run against anything that does not look like a local database —
 * seeding production would be an expensive way to learn this lesson.
 */

import { Types } from 'mongoose';
import { connectToDatabase, disconnectFromDatabase } from '../src/lib/db/connect';
import { Plan } from '../src/lib/db/models/Plan';
import { User } from '../src/lib/db/models/User';
import { Site } from '../src/lib/db/models/Site';
import { Membership } from '../src/lib/db/models/Membership';
import { Product } from '../src/lib/db/models/Product';
import { Order } from '../src/lib/db/models/Order';
import { LedgerEntry } from '../src/lib/db/models/LedgerEntry';
import { Post } from '../src/lib/db/models/Post';
import { Project } from '../src/lib/db/models/Project';
import { hashPassword } from '../src/lib/auth/password';
import { computeSplit } from '../src/lib/payments/computeSplit';
import { runWithTenant, runWithoutTenantScope } from '../src/lib/tenant/context';
import '../src/lib/db/models/index';
import { describeUri } from './doctor';
import { PLANS } from '../src/config/fees';

/** Plan fee terms come from src/config/fees.ts, the same file the landing page reads. */
function planTerms(code: 'free' | 'pro') {
  const plan = PLANS[code];
  return {
    name: plan.name,
    feePercentBps: plan.feePercentBps,
    feeFlatKobo: plan.feeFlatKobo,
    feeCapKobo: plan.feeCapKobo,
    vatOnPlatformFeeBps: plan.vatOnPlatformFeeBps,
    paystackFeeBearer: plan.paystackFeeBearer,
  };
}

const SELLER_EMAIL = 'ade@example.com';
const SELLER_PASSWORD = 'correct-horse-battery';

function assertLocal(uri: string): void {
  const isLocal = /127\.0\.0\.1|localhost/.test(uri);
  if (!isLocal && process.env.ALLOW_REMOTE_SEED !== 'true') {
    throw new Error(
      // Host and database only: the URI carries the password, and this message
      // is exactly the kind that gets pasted into a chat or an issue.
      `Refusing to seed ${describeUri(uri)}: it does not look local. Set ALLOW_REMOTE_SEED=true to override.`,
    );
  }
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  assertLocal(uri);

  await connectToDatabase(uri);

  await Plan.bulkWrite([
    {
      updateOne: {
        filter: { code: 'free' },
        update: {
          $set: {
            ...planTerms('free'),
            limits: {
              products: 20,
              staff: 1,
              storageMb: 200,
              customDomain: false,
              modules: ['store', 'portfolio', 'blog'],
            },
            active: true,
          },
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { code: 'pro' },
        update: {
          $set: {
            ...planTerms('pro'),
            limits: {
              products: null,
              staff: 10,
              storageMb: 5_000,
              customDomain: true,
              modules: ['store', 'portfolio', 'blog'],
            },
            active: true,
          },
        },
        upsert: true,
      },
    },
  ]);

  const owner =
    (await User.findOne({ email: SELLER_EMAIL })) ??
    (await User.create({
      email: SELLER_EMAIL,
      name: 'Ade Okon',
      passwordHash: await hashPassword(SELLER_PASSWORD),
      platformRole: 'user',
      emailVerifiedAt: new Date(),
    }));

  let site = await Site.findOne({ slug: 'ade-store' });
  if (!site) {
    site = await Site.create({
      slug: 'ade-store',
      name: 'Ade Textiles',
      ownerId: owner._id,
      planCode: 'pro',
      modules: { store: true, portfolio: true, blog: true },
      payout: {
        businessName: 'Ade Textiles Ltd',
        bankCode: '058',
        accountNumberLast4: '6789',
        resolvedAccountName: 'ADE OKON',
        subaccountCode: 'ACCT_seed_demo',
        status: 'verified',
        verifiedAt: new Date(),
      },
      settings: { tagline: 'Hand-dyed adire and ready-to-wear, made in Lagos.' },
    });
  }

  await Membership.updateOne(
    { userId: owner._id, siteId: site._id },
    { $set: { role: 'owner', acceptedAt: new Date() } },
    { upsert: true },
  );

  const tenant = { siteId: String(site._id), slug: site.slug };

  await runWithTenant(tenant, async () => {
    await Product.deleteMany({});
    await Post.deleteMany({});
    await Project.deleteMany({});
    await Order.deleteMany({});
  });

  // LedgerEntry is append-only, so it cannot be cleared through the model.
  await runWithoutTenantScope('seed script resetting demo ledger data', async () => {
    await LedgerEntry.collection.deleteMany({ siteId: site!._id });
  });

  const catalogue = [
    { title: 'Adire Wrap Dress', priceNaira: 38_500 },
    { title: 'Indigo Kaftan', priceNaira: 52_000 },
    { title: 'Hand-dyed Scarf', priceNaira: 12_500 },
    { title: 'Agbada Set', priceNaira: 96_000 },
    { title: 'Ankara Tote', priceNaira: 18_000 },
    { title: 'Aso-oke Runner', priceNaira: 24_500 },
  ];

  const products = await runWithTenant(tenant, () =>
    Product.insertMany(
      catalogue.map((item, index) => ({
        title: item.title,
        slug: item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        priceKobo: item.priceNaira * 100,
        status: 'active',
        descriptionHtml: `<p>${item.title} from the Harmattan collection.</p>`,
        inventory: { track: true, quantity: 20 - index, policy: 'deny' },
      })),
    ),
  );

  await runWithTenant(tenant, () =>
    Post.insertMany([
      {
        title: 'How adire is made',
        slug: 'how-adire-is-made',
        excerpt: 'Resist-dyeing by hand takes four days and a lot of patience.',
        contentHtml:
          '<p>Every piece starts as plain cotton.</p><h2>The resist</h2>' +
          '<p>Patterns are tied, stitched or stencilled before the cloth ever meets indigo.</p>' +
          '<blockquote>No two pieces come out the same.</blockquote>',
        status: 'published',
        publishedAt: new Date(Date.now() - 6 * 86_400_000),
        readingMinutes: 3,
        tags: ['craft', 'adire'],
        seo: { metaDescription: 'A short look at how our hand-dyed adire is made in Lagos, from tying the resist through four days of indigo.', noindex: false },
      },
      {
        title: 'Caring for indigo',
        slug: 'caring-for-indigo',
        excerpt: 'Cold water, no direct sun, and never wring it out.',
        contentHtml: '<p>Indigo keeps moving for months after it leaves the vat.</p>',
        status: 'published',
        publishedAt: new Date(Date.now() - 2 * 86_400_000),
        readingMinutes: 2,
        tags: ['care'],
        seo: { noindex: false },
      },
    ]),
  );

  await runWithTenant(tenant, () =>
    Project.insertMany([
      {
        title: 'Lagos Fashion Week capsule',
        slug: 'lfw-capsule',
        summary: 'A twelve-piece capsule shown at Lagos Fashion Week.',
        client: 'Lagos Fashion Week',
        role: 'Design and production',
        status: 'published',
        publishedAt: new Date(),
        position: 1,
        seo: { noindex: false },
      },
    ]),
  );

  // A month of trading with a believable shape: quiet weekends, a spike.
  const plan = await Plan.findOne({ code: 'pro' });
  const terms = {
    feePercentBps: plan!.feePercentBps,
    feeFlatKobo: plan!.feeFlatKobo,
    feeCapKobo: plan!.feeCapKobo,
    vatOnPlatformFeeBps: plan!.vatOnPlatformFeeBps,
    paystackFeeBearer: plan!.paystackFeeBearer,
  };

  let created = 0;

  for (let dayOffset = 29; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(Date.now() - dayOffset * 86_400_000);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const spike = dayOffset === 9 || dayOffset === 8;
    const salesToday = weekend ? 0 : spike ? 5 : (dayOffset % 3 === 0 ? 2 : 1);

    for (let n = 0; n < salesToday; n += 1) {
      const product = products[(dayOffset + n) % products.length];
      const quantity = 1 + ((dayOffset + n) % 2);
      const total = product.priceKobo * quantity;
      const split = computeSplit(total, terms);
      const reference = `hm_seed_${dayOffset}_${n}`;

      const order = await runWithTenant(tenant, () =>
        Order.create({
          orderNumber: `HM-SEED-${dayOffset}${n}`,
          customerEmail: `buyer${n}@example.com`,
          items: [
            {
              productId: product._id,
              title: product.title,
              unitPriceKobo: product.priceKobo,
              quantity,
              lineTotalKobo: total,
            },
          ],
          subtotalKobo: total,
          totalKobo: total,
          feeSnapshot: { planCode: 'pro', ...terms },
          split: {
            grossKobo: split.gross,
            platformFeeKobo: split.platformFee,
            platformFeeVatKobo: split.platformFeeVat,
            paystackFeeKobo: split.paystackFee,
            sellerNetKobo: split.sellerNet,
          },
          status: 'paid',
          paystack: { reference, paidAt: day, amountKobo: total, currency: 'NGN' },
          createdAt: day,
        }),
      );

      await runWithTenant(tenant, () =>
        LedgerEntry.create({
          orderId: order._id,
          groupId: new Types.ObjectId(),
          entryType: 'sale',
          grossKobo: split.gross,
          providerFeeKobo: split.paystackFee,
          platformCommissionKobo: split.platformFee,
          platformCommissionVatKobo: split.platformFeeVat,
          sellerNetKobo: split.sellerNet,
          status: dayOffset > 3 ? 'settled' : 'pending',
          paystack: { reference },
          createdAt: day,
        }),
      );

      created += 1;
    }
  }

  console.log('Seeded.');
  console.log(`  Site:      ${site.name} (${site.slug})  id=${site._id}`);
  console.log(`  Seller:    ${SELLER_EMAIL} / ${SELLER_PASSWORD}`);
  console.log(`  Products:  ${products.length}`);
  console.log(`  Orders:    ${created}`);
  console.log('');
  console.log(`  Storefront: http://${site.slug}.${process.env.ROOT_DOMAIN ?? 'hordemart.local:3000'}`);
  console.log(`  Dashboard:  http://${process.env.APP_HOST ?? 'app.hordemart.local:3000'}/dashboard/${site._id}`);
}

main()
  .catch((error) => {
    // Message only. A driver error can carry the connection string, and that
    // carries the password (rule 5: secrets are never logged).
    console.error('Seed failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectFromDatabase();
  });
