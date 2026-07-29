import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { POST } from "../app/api/explain-match/route.ts";

describe("match explanation API", () => {
  it("returns a fallback explanation for a valid payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/explain-match", {
        method: "POST",
        body: JSON.stringify({
          idolName: "王一博",
          userTags: ["清冷", "舞台型", "实力派"],
          matchedTags: ["清冷", "舞台型"],
          entryReasons: ["出圈舞台直拍", "代表作品/角色混剪"]
        })
      })
    );
    const payload = (await response.json()) as { mode?: string; explanation?: string };

    assert.equal(response.status, 200);
    assert.equal(payload.mode, "fallback");
    assert.match(payload.explanation ?? "", /娱乐向/);
  });
});
