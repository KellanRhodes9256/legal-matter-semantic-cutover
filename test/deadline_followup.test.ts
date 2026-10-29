import test from "node:test";
import assert from "node:assert/strict";
import { decideMatterWorkflow } from "../src/matter_decision.js";

test("a signed matter due within two days gets immediate follow-up", () => {
  const result = decideMatterWorkflow({
    matterId: "M-104",
    clientName: "Avery Chen",
    signedDocumentUrl: "https://files.example.test/M-104.pdf",
    deadline: "2027-04-02T09:00:00.000Z",
    question: "What notice cases help explain a late contract amendment?"
  }, new Date("2027-04-01T12:00:00.000Z"));

  assert.deepEqual(result, {
    delivery: "deliver-signed-document",
    followUp: "same-day",
    deadlineStatus: "urgent"
  });
});
