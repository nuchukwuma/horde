/**
 * Integration tests need a real MongoDB. Set MONGODB_TEST_URI to enable them:
 *
 *   docker run -d -p 27017:27017 mongo:7
 *   MONGODB_TEST_URI=mongodb://127.0.0.1:27017/hordemart_test npm test
 *
 * Without it, the integration suites report as skipped rather than failing, so a
 * developer without Docker still gets the full unit suite.
 *
 * CI must not be allowed that latitude. A green run that silently skipped every
 * database test is worse than a red one: it reports confidence nobody earned,
 * and the suites most worth trusting here — tenant isolation, ledger
 * immutability, session scope — are exactly the ones that need a database.
 *
 * So CI sets REQUIRE_DB_TESTS=1, and this module then refuses to let the run
 * proceed pretending. The check lives here rather than in a workflow assertion
 * because a workflow step can be reordered or dropped without anyone noticing,
 * whereas this fails at import, inside the suite it protects.
 */

const uri = process.env.MONGODB_TEST_URI ?? '';
const required = process.env.REQUIRE_DB_TESTS === '1';

if (required && !uri) {
  throw new Error(
    'REQUIRE_DB_TESTS=1 but MONGODB_TEST_URI is not set. The integration suites ' +
      'would have skipped silently and the run would have reported green. ' +
      'Start a MongoDB and set MONGODB_TEST_URI, or unset REQUIRE_DB_TESTS ' +
      'to run the unit suite alone.',
  );
}

export const TEST_MONGO_URI = uri;
export const hasMongo = uri.length > 0;
