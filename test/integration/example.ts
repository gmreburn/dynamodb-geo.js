import { Agent } from "http";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import * as ddbGeo from "../../src";
import { DynamoDB, waitUntilTableExists } from "@aws-sdk/client-dynamodb";
import { expect } from "chai";
import S2 from "@radarlabs/s2";

describe("Example", function () {
  // Use a local DB for the example.
  const ddb = new DynamoDB({
    requestHandler: new NodeHttpHandler({
      httpAgent: new Agent({
        /*params*/
      }),
    }),
    endpoint: "http://127.0.0.1:8000",

    credentials: {
      accessKeyId: "dummy",
      secretAccessKey: "dummy",
    },

    region: "eu-west-1",
  });

  // Configuration for a new instance of a GeoDataManager. Each GeoDataManager instance represents a table
  const config = new ddbGeo.GeoDataManagerConfiguration(ddb, "test-capitals");

  // Instantiate the table manager
  const capitalsManager = new ddbGeo.GeoDataManager(config);

  before(async function () {
    this.timeout(20000);
    config.hashKeyLength = 3;
    config.consistentRead = true;

    // Use GeoTableUtil to help construct a CreateTableInput.
    const createTableInput = ddbGeo.GeoTableUtil.getCreateTableRequest(config);
    if (createTableInput.ProvisionedThroughput)
      createTableInput.ProvisionedThroughput.ReadCapacityUnits = 2;
    await ddb.createTable(createTableInput);
    // Wait for it to become ready
    await waitUntilTableExists(
      {
        client: ddb,
        maxWaitTime: 200,
      },
      { TableName: config.tableName }
    );
    // Load sample data in batches

    console.log("Loading sample data from capitals.json");
    const data = require("../../example/capitals.json");
    const putPointInputs = data.map(function (capital, i) {
      return {
        RangeKeyValue: { S: String(i) }, // Use this to ensure uniqueness of the hash/range pairs.
        GeoPoint: new S2.LatLng(capital.latitude, capital.longitude),
        PutItemInput: {
          Item: {
            country: { S: capital.country },
            capital: { S: capital.capital },
          },
        },
      };
    });

    const BATCH_SIZE = 25;
    const WAIT_BETWEEN_BATCHES_MS = 1000;
    let currentBatch = 1;

    async function resumeWriting() {
      if (putPointInputs.length === 0) {
        console.log("Finished loading");
        return;
      }
      const thisBatch = [];
      for (
        var i = 0, itemToAdd = null;
        i < BATCH_SIZE && (itemToAdd = putPointInputs.shift());
        i++
      ) {
        thisBatch.push(itemToAdd);
      }
      console.log(
        "Writing batch " +
          currentBatch++ +
          "/" +
          Math.ceil(data.length / BATCH_SIZE)
      );
      await capitalsManager.batchWritePoints(thisBatch);
      // Sleep
      await new Promise((resolve) =>
        setInterval(resolve, WAIT_BETWEEN_BATCHES_MS)
      );
      return resumeWriting();
    }
    return resumeWriting();
  });

  it("queryRadius", async function () {
    this.timeout(20000);
    // Perform a radius query
    const result = await capitalsManager.queryRadius({
      RadiusInMeter: 100000,
      CenterPoint: new S2.LatLng(52.22573, 0.149593),
    });

    expect(result).to.deep.equal([
      {
        rangeKey: { S: "50" },
        country: { S: "United Kingdom" },
        capital: { S: "London" },
        hashKey: { N: "522" },
        geoJson: { S: '{"type":"Point","coordinates":[-0.13,51.51]}' },
        geohash: { N: "5221366118452580119" },
      },
    ]);
  });

  after(async function () {
    this.timeout(10000);
    await ddb.deleteTable({ TableName: config.tableName });
  });
});
