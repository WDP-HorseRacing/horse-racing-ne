import {
  clearAllMongoCollections,
  startTestMongo,
  stopTestMongo,
  type TestMongo,
} from './mongo';

describe('test Mongo helper', () => {
  let mongo: TestMongo;

  beforeAll(async () => {
    mongo = await startTestMongo();
  });

  afterAll(() => stopTestMongo(mongo));

  it('clears documents but keeps collections and their indexes', async () => {
    const items = mongo.connection.collection('items');
    await items.createIndex({ key: 1 }, { unique: true, name: 'key_uq' });
    await items.insertOne({ key: 'a' });

    await clearAllMongoCollections(mongo.connection);

    expect(await items.countDocuments()).toBe(0);
    const indexNames = (await items.indexes()).map((index) => index.name);
    expect(indexNames).toContain('key_uq');
  });
});
