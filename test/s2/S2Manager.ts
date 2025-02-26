import { S2Manager } from "../../src/s2/S2Manager";
import { expect } from "chai";
import S2 from "@radarlabs/s2";

describe("S2Manager", () => {
  it("generateGeoHash", () => {
    expect(
      S2Manager.generateGeohash(new S2.LatLng(52.1, 2)).toString(10)
    ).to.equal("5177531549489041509");
  });

  it("generateHashKey", () => {
    expect(S2Manager.generateHashKey(5177531549489041509n, 6)).to.equal(
      517753n
    );
  });
});
