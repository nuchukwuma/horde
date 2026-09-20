/**
 * Integration tests need a real MongoDB. Set MONGODB_TEST_URI to enable them:
 *
 *   docker run -d -p 27017:27017 mongo:7
 *   MONGODB_TEST_URI=mongodb://127.0.0.1:27017/hordemart_test npm test
 *
 * Without it, the integration suites report as skipped rather than failing, so a
 * developer without Docker still gets the full unit suite. CI must set it — a
 * green run that silently skipped every database test is worse than a red one.
 */

export const TEST_MONGO_URI = process.env.MONGODB_TEST_URI ?? '';
export const hasMongo = TEST_MONGO_URI.length > 0;
